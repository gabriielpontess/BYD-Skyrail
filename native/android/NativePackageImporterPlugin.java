package com.byd.skyrail.documents;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Iterator;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

@CapacitorPlugin(name = "NativePackageImporter")
public class NativePackageImporterPlugin extends Plugin {
    private static final String MANIFEST = "manifest.json";
    private static final String DEFAULT_CATALOG = "documents.json";
    private static final int MAX_SCHEMA_VERSION = 1;
    private static final int BUFFER_SIZE = 64 * 1024;
    private static final long MAX_METADATA_BYTES = 16L * 1024L * 1024L;

    @PluginMethod
    public void importPackage(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("application/zip");
        intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{"application/zip", "application/octet-stream", "application/x-zip-compressed"});
        startActivityForResult(call, intent, "packagePicked");
    }

    @ActivityCallback
    private void packagePicked(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null || result.getData().getData() == null) {
            call.reject("Seleção do pacote cancelada.");
            return;
        }
        Uri uri = result.getData().getData();
        new Thread(() -> {
            try {
                call.resolve(importUri(uri));
            } catch (Exception error) {
                call.reject(userMessage(error), error);
            }
        }, "skyrail-package-import").start();
    }

    private JSObject importUri(Uri uri) throws Exception {
        String runId = UUID.randomUUID().toString();
        File filesRoot = getContext().getFilesDir();
        File skyrailRoot = new File(filesRoot, "skyrail");
        File stagingRoot = new File(new File(skyrailRoot, "staging-native"), runId);
        File stagedDocuments = new File(stagingRoot, "documents");
        if (!stagedDocuments.mkdirs() && !stagedDocuments.isDirectory()) throw new Exception("Não foi possível preparar a área temporária de importação.");

        Map<String, String> metadata = new HashMap<>();
        Set<String> staged = new HashSet<>();
        long extractedBytes = 0L;
        int entries = 0;

        try {
            try (InputStream raw = getContext().getContentResolver().openInputStream(uri)) {
                if (raw == null) throw new Exception("Não foi possível abrir o pacote selecionado.");
                try (ZipInputStream zip = new ZipInputStream(new BufferedInputStream(raw, BUFFER_SIZE))) {
                    ZipEntry entry;
                    byte[] buffer = new byte[BUFFER_SIZE];
                    while ((entry = zip.getNextEntry()) != null) {
                        String name = normalizeEntryName(entry.getName());
                        if (entry.isDirectory() || name.isEmpty()) {
                            zip.closeEntry();
                            continue;
                        }
                        entries++;
                        if (isMetadata(name)) {
                            ByteArrayOutputStream out = new ByteArrayOutputStream();
                            int read;
                            long total = 0L;
                            while ((read = zip.read(buffer)) != -1) {
                                total += read;
                                if (total > MAX_METADATA_BYTES) throw new Exception(name + " excede o limite seguro de metadados.");
                                out.write(buffer, 0, read);
                            }
                            metadata.put(baseName(name), out.toString(StandardCharsets.UTF_8.name()));
                            extractedBytes += total;
                        } else if (isDocumentPdf(name)) {
                            String relative = name.substring("documents/".length());
                            File target = safeChild(stagedDocuments, relative);
                            File parent = target.getParentFile();
                            if (parent != null && !parent.mkdirs() && !parent.isDirectory()) throw new Exception("Não foi possível preparar a pasta do documento.");
                            try (BufferedOutputStream out = new BufferedOutputStream(new FileOutputStream(target), BUFFER_SIZE)) {
                                int read;
                                long current = 0L;
                                while ((read = zip.read(buffer)) != -1) {
                                    out.write(buffer, 0, read);
                                    current += read;
                                }
                                extractedBytes += current;
                            }
                            staged.add("documents/" + relative.replace('\\', '/'));
                        } else {
                            while (zip.read(buffer) != -1) { /* discard unsupported entry without materializing it */ }
                        }
                        notifyProgress("extract", entries, name, 0, 0, null);
                        zip.closeEntry();
                    }
                }
            }

            String manifestText = metadata.get(MANIFEST);
            if (manifestText == null) throw new Exception("Pacote sem manifest.json.");
            JSONObject manifestRaw = new JSONObject(manifestText);
            String packageVersion = requiredText(manifestRaw, "packageVersion", "Manifesto sem packageVersion.");
            String catalogFile = cleanText(manifestRaw.optString("catalogFile", DEFAULT_CATALOG));
            if (catalogFile.isEmpty()) catalogFile = DEFAULT_CATALOG;
            int schemaVersion = manifestRaw.optInt("schemaVersion", 1);
            if (schemaVersion > MAX_SCHEMA_VERSION) throw new Exception("Pacote incompatível: schemaVersion " + schemaVersion + ".");

            String catalogText = metadata.get(baseName(catalogFile));
            if (catalogText == null) throw new Exception("Pacote sem " + catalogFile + ".");
            JSONObject catalog = new JSONObject(catalogText);
            JSONArray documents = catalog.optJSONArray("documents");
            if (documents == null) throw new Exception("Catálogo documents.json inválido.");

            validateCatalog(documents, staged);
            JSONObject previousCatalog = readExistingCatalog(new File(new File(skyrailRoot, "catalog"), "documents.json"));
            Set<String> previousFiles = collectManagedFiles(previousCatalog);

            File documentsRoot = new File(skyrailRoot, "documents");
            if (!documentsRoot.mkdirs() && !documentsRoot.isDirectory()) throw new Exception("Não foi possível preparar o armazenamento documental.");

            int totalActive = countActive(documents);
            int done = 0;
            for (int i = 0; i < documents.length(); i++) {
                JSONObject doc = documents.getJSONObject(i);
                if (!isActive(doc)) continue;
                String id = requiredDocText(doc, "id");
                String code = requiredDocText(doc, "code");
                String fileName = documentFileName(doc);
                File source = safeChild(stagedDocuments, fileName);
                if (!source.isFile()) throw new Exception("Arquivo ausente durante commit: " + fileName);
                String finalName = safePart(packageVersion + "__" + fileName);
                File documentDir = safeChild(documentsRoot, safePart(id));
                if (!documentDir.mkdirs() && !documentDir.isDirectory()) throw new Exception("Não foi possível criar a pasta do documento " + code + ".");
                File destination = safeChild(documentDir, finalName);
                moveFile(source, destination);
                doc.put("file_path", packageVersion + "__" + fileName);
                doc.put("file", fileName);
                doc.put("package_version", packageVersion);
                done++;
                notifyProgress("write", entries, null, done, totalActive, code);
            }

            catalog.put("schemaVersion", catalog.optInt("schemaVersion", schemaVersion));
            if (!catalog.has("catalogVersion") || cleanText(catalog.optString("catalogVersion", "")).isEmpty()) catalog.put("catalogVersion", packageVersion);
            if (!catalog.has("generatedAt") || cleanText(catalog.optString("generatedAt", "")).isEmpty()) catalog.put("generatedAt", manifestRaw.optString("createdAt", ""));
            catalog.put("packageVersion", packageVersion);

            File catalogDir = new File(skyrailRoot, "catalog");
            if (!catalogDir.mkdirs() && !catalogDir.isDirectory()) throw new Exception("Não foi possível preparar o catálogo local.");
            File catalogTarget = new File(catalogDir, "documents.json");
            writeAtomically(catalogTarget, catalog.toString());

            cleanupOldManagedFiles(documentsRoot, previousFiles, collectManagedFiles(catalog));
            deleteRecursively(stagingRoot);

            JSObject result = new JSObject();
            result.put("catalogVersion", catalog.optString("catalogVersion", packageVersion));
            result.put("generatedAt", catalog.optString("generatedAt", ""));
            result.put("packageVersion", packageVersion);
            result.put("documentCount", countActive(documents));
            result.put("contentBytes", extractedBytes);
            return result;
        } catch (Exception error) {
            deleteRecursively(stagingRoot);
            throw error;
        }
    }

    private void validateCatalog(JSONArray documents, Set<String> staged) throws Exception {
        Set<String> ids = new HashSet<>();
        Set<String> documentKeys = new HashSet<>();
        for (int i = 0; i < documents.length(); i++) {
            JSONObject doc = documents.getJSONObject(i);
            String id = requiredDocText(doc, "id");
            String code = requiredDocText(doc, "code");
            requiredDocText(doc, "title");
            requiredDocText(doc, "revision");
            String file = documentFileName(doc);
            if (!ids.add(id)) throw new Exception("ID duplicado no catálogo: " + id);
            String system = cleanText(doc.optString("system_id", doc.optString("system_name", ""))).toLowerCase(new Locale("pt", "BR"));
            String key = code.toLowerCase(new Locale("pt", "BR")) + "|" + system;
            if (!documentKeys.add(key)) throw new Exception("Código duplicado no mesmo sistema: " + code);
            if (isActive(doc) && !staged.contains("documents/" + file.replace('\\', '/'))) throw new Exception("Pacote incompleto: PDF não encontrado para " + code + ".");
        }
    }

    private JSONObject readExistingCatalog(File file) {
        if (!file.isFile()) return null;
        try (FileInputStream input = new FileInputStream(file); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[32 * 1024];
            int read;
            while ((read = input.read(buffer)) != -1) out.write(buffer, 0, read);
            return new JSONObject(out.toString(StandardCharsets.UTF_8.name()));
        } catch (Exception ignored) {
            return null;
        }
    }

    private Set<String> collectManagedFiles(JSONObject catalog) {
        Set<String> files = new HashSet<>();
        if (catalog == null) return files;
        JSONArray docs = catalog.optJSONArray("documents");
        if (docs == null) return files;
        for (int i = 0; i < docs.length(); i++) {
            JSONObject doc = docs.optJSONObject(i);
            if (doc == null) continue;
            String id = cleanText(doc.optString("id", ""));
            String path = cleanText(doc.optString("file_path", ""));
            if (!id.isEmpty() && !path.isEmpty()) files.add(safePart(id) + "/" + safePart(path));
        }
        return files;
    }

    private void cleanupOldManagedFiles(File documentsRoot, Set<String> previousFiles, Set<String> currentFiles) {
        for (String relative : previousFiles) {
            if (currentFiles.contains(relative)) continue;
            try {
                File old = safeChild(documentsRoot, relative);
                if (old.isFile()) old.delete();
            } catch (Exception ignored) { }
        }
    }

    private int countActive(JSONArray documents) {
        int count = 0;
        for (int i = 0; i < documents.length(); i++) if (isActive(documents.optJSONObject(i))) count++;
        return count;
    }

    private boolean isActive(JSONObject doc) {
        if (doc == null) return false;
        String status = cleanText(doc.optString("status", "active")).toLowerCase(Locale.ROOT);
        return doc.optBoolean("active", true) && "active".equals(status);
    }

    private String documentFileName(JSONObject doc) throws Exception {
        String file = cleanText(doc.optString("file", doc.optString("file_path", "")));
        if (file.isEmpty()) throw new Exception("Há documento com campos obrigatórios ausentes no catálogo.");
        if (file.contains("/") || file.contains("\\") || file.equals(".") || file.equals("..")) throw new Exception("Caminho de PDF inválido no catálogo: " + file);
        return file;
    }

    private String requiredDocText(JSONObject doc, String key) throws Exception {
        String value = cleanText(doc.optString(key, ""));
        if (value.isEmpty()) throw new Exception("Há documento com campos obrigatórios ausentes no catálogo.");
        return value;
    }

    private String requiredText(JSONObject object, String key, String message) throws Exception {
        String value = cleanText(object.optString(key, ""));
        if (value.isEmpty()) throw new Exception(message);
        return value;
    }

    private boolean isMetadata(String name) {
        String base = baseName(name);
        return MANIFEST.equals(base) || DEFAULT_CATALOG.equals(base);
    }

    private boolean isDocumentPdf(String name) {
        return name.startsWith("documents/") && name.toLowerCase(Locale.ROOT).endsWith(".pdf") && name.length() > "documents/.pdf".length();
    }

    private String normalizeEntryName(String name) throws Exception {
        String value = name == null ? "" : name.replace('\\', '/');
        while (value.startsWith("./")) value = value.substring(2);
        if (value.startsWith("/") || value.contains("../") || value.equals("..") || value.contains("\u0000")) throw new Exception("Pacote contém caminho inseguro.");
        return value;
    }

    private String baseName(String path) {
        String normalized = path == null ? "" : path.replace('\\', '/');
        int slash = normalized.lastIndexOf('/');
        return slash >= 0 ? normalized.substring(slash + 1) : normalized;
    }

    private String cleanText(String value) {
        return value == null ? "" : value.trim();
    }

    private String safePart(String value) {
        String cleaned = value == null ? "" : value.replaceAll("[^a-zA-Z0-9._-]", "_");
        return cleaned.isEmpty() ? "_" : cleaned;
    }

    private File safeChild(File root, String relative) throws Exception {
        File target = new File(root, relative);
        String rootPath = root.getCanonicalPath() + File.separator;
        String targetPath = target.getCanonicalPath();
        if (!targetPath.startsWith(rootPath)) throw new Exception("Pacote contém caminho inseguro.");
        return target;
    }

    private void moveFile(File source, File destination) throws Exception {
        File temp = new File(destination.getParentFile(), destination.getName() + ".tmp");
        if (temp.exists() && !temp.delete()) throw new Exception("Não foi possível substituir arquivo temporário.");
        if (!source.renameTo(temp)) copyFile(source, temp);
        if (destination.exists() && !destination.delete()) throw new Exception("Não foi possível substituir documento anterior.");
        if (!temp.renameTo(destination)) {
            copyFile(temp, destination);
            if (!temp.delete()) temp.deleteOnExit();
        }
        if (source.exists()) source.delete();
    }

    private void copyFile(File source, File destination) throws Exception {
        try (BufferedInputStream input = new BufferedInputStream(new FileInputStream(source), BUFFER_SIZE);
             BufferedOutputStream output = new BufferedOutputStream(new FileOutputStream(destination), BUFFER_SIZE)) {
            byte[] buffer = new byte[BUFFER_SIZE];
            int read;
            while ((read = input.read(buffer)) != -1) output.write(buffer, 0, read);
        }
    }

    private void writeAtomically(File target, String content) throws Exception {
        File temp = new File(target.getParentFile(), target.getName() + ".tmp");
        try (BufferedOutputStream out = new BufferedOutputStream(new FileOutputStream(temp), 32 * 1024)) {
            out.write(content.getBytes(StandardCharsets.UTF_8));
        }
        if (target.exists()) {
            File backup = new File(target.getParentFile(), target.getName() + ".bak");
            if (backup.exists()) backup.delete();
            if (!target.renameTo(backup)) throw new Exception("Não foi possível preservar o catálogo anterior.");
            if (!temp.renameTo(target)) {
                backup.renameTo(target);
                throw new Exception("Não foi possível ativar o novo catálogo.");
            }
            backup.delete();
        } else if (!temp.renameTo(target)) {
            throw new Exception("Não foi possível ativar o novo catálogo.");
        }
    }

    private void notifyProgress(String phase, int entries, String name, int done, int total, String code) {
        JSObject progress = new JSObject();
        progress.put("phase", phase);
        progress.put("entries", entries);
        if (name != null) progress.put("name", name);
        if (done > 0 || total > 0) {
            progress.put("done", done);
            progress.put("total", total);
        }
        if (code != null) progress.put("code", code);
        notifyListeners("progress", progress);
    }

    private String userMessage(Exception error) {
        String message = error.getMessage() == null ? error.toString() : error.getMessage();
        String lower = message.toLowerCase(Locale.ROOT);
        if (lower.contains("enospc") || lower.contains("no space") || lower.contains("space left")) return "Não há espaço suficiente para concluir a atualização.";
        return "Importação interrompida sem substituir o catálogo ativo: " + message;
    }

    private void deleteRecursively(File file) {
        if (file == null || !file.exists()) return;
        if (file.isDirectory()) {
            File[] children = file.listFiles();
            if (children != null) for (File child : children) deleteRecursively(child);
        }
        file.delete();
    }
}
