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
import java.math.BigInteger;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Enumeration;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;

@CapacitorPlugin(name="NativePackageImporter")
public class NativePackageImporterPlugin extends Plugin {
  private static final String MANIFEST="manifest.json",CATALOG="documents.json";
  private static final int MAX_SCHEMA_VERSION=2,BUFFER_SIZE=64*1024;
  private static final long MAX_METADATA_BYTES=16L*1024L*1024L,MAX_TOTAL_UNCOMPRESSED_BYTES=20L*1024L*1024L*1024L,MIN_FREE_BYTES=128L*1024L*1024L;
  private static final Pattern REVISION_TOKEN=Pattern.compile("\\d+|\\D+");

  @PluginMethod public void importPackage(PluginCall call){
    Intent intent=new Intent(Intent.ACTION_OPEN_DOCUMENT);intent.addCategory(Intent.CATEGORY_OPENABLE);intent.setType("application/zip");
    intent.putExtra(Intent.EXTRA_MIME_TYPES,new String[]{"application/zip","application/octet-stream","application/x-zip-compressed"});
    startActivityForResult(call,intent,"packagePicked");
  }

  @ActivityCallback private void packagePicked(PluginCall call,ActivityResult result){
    if(call==null)return;
    if(result.getResultCode()!=Activity.RESULT_OK||result.getData()==null||result.getData().getData()==null){call.reject("Seleção do pacote cancelada.");return;}
    Uri uri=result.getData().getData();
    new Thread(()->{try{call.resolve(importUri(uri));}catch(Exception error){call.reject(userMessage(error),error);}},"skyrail-package-import").start();
  }

  private JSObject importUri(Uri uri)throws Exception{
    String runId=UUID.randomUUID().toString();
    File skyrailRoot=new File(getContext().getFilesDir(),"skyrail"),stagingBase=new File(skyrailRoot,"staging-native");
    deleteRecursively(stagingBase);File stagingRoot=new File(stagingBase,runId);if(!stagingRoot.mkdirs()&&!stagingRoot.isDirectory())throw new Exception("Não foi possível preparar a área temporária de importação.");
    File sourceZip=new File(stagingRoot,"selected-package.zip"),catalogTarget=new File(new File(skyrailRoot,"catalog"),CATALOG),documentsRoot=new File(skyrailRoot,"documents");
    List<File> promotedThisRun=new ArrayList<>();boolean catalogCommitted=false;
    try{
      copySelectedPackage(uri,sourceZip);
      try(ZipFile archive=new ZipFile(sourceZip)){
        Map<String,ZipEntry> entries=indexEntries(archive);long[] extracted={0L};
        ZipEntry manifestEntry=metadataEntry(entries,MANIFEST);if(manifestEntry==null)throw new Exception("Pacote sem manifest.json.");
        JSONObject manifest=parseJsonObject(MANIFEST,readMetadataEntry(archive,manifestEntry,extracted));
        String packageVersion=requiredText(manifest,"packageVersion","Manifesto sem packageVersion."),mode="incremental".equalsIgnoreCase(cleanText(manifest.optString("mode","full")))?"incremental":"full";
        String catalogFile=cleanText(manifest.optString("catalogFile",CATALOG));if(catalogFile.isEmpty())catalogFile=CATALOG;if(!CATALOG.equals(baseName(catalogFile)))throw new Exception("Pacote incompatível: catalogFile deve apontar para documents.json.");
        int schemaVersion=manifest.optInt("schemaVersion",1);if(schemaVersion<1||schemaVersion>MAX_SCHEMA_VERSION)throw new Exception("Pacote incompatível: schemaVersion "+schemaVersion+".");
        ZipEntry catalogEntry=metadataEntry(entries,CATALOG);if(catalogEntry==null)throw new Exception("Pacote sem "+catalogFile+".");
        JSONObject incomingCatalog=parseJsonObject(CATALOG,readMetadataEntry(archive,catalogEntry,extracted));JSONArray incomingDocs=incomingCatalog.optJSONArray("documents");if(incomingDocs==null)throw new Exception("Catálogo documents.json inválido.");
        validateCatalog(incomingDocs,entries,schemaVersion,mode);
        JSONObject previousCatalog=readExistingCatalog(catalogTarget);CatalogPlan plan=buildPlan(previousCatalog,incomingCatalog,manifest,mode,schemaVersion);
        if(!documentsRoot.mkdirs()&&!documentsRoot.isDirectory())throw new Exception("Não foi possível preparar o armazenamento documental.");
        cleanupUnreferencedFiles(documentsRoot,collectManagedFiles(previousCatalog));ensureFreeSpace(documentsRoot);
        int total=0;for(DocumentAction action:plan.actions)if(action.active&&!action.reuse)total++;int done=0;
        for(DocumentAction action:plan.actions){
          if(!action.active)continue;
          String expected=cleanText(action.incoming.optString("sha256","")).toLowerCase(Locale.ROOT);
          if(action.reuse){preserveInstalledFile(action);continue;}
          if(action.verifyExisting&&action.existing!=null){
            File old=managedFile(documentsRoot,action.existing);
            if(old!=null&&old.isFile()&&old.length()>0){String installed=sha256File(old);if(!installed.equals(expected))throw new Exception("Conflito de integridade em "+requiredDocText(action.incoming,"code")+": a mesma revisão possui conteúdo diferente do instalado.");preserveInstalledFile(action);action.next.put("sha256",expected);continue;}
          }
          String fileName=documentFileName(action.incoming),entryName="documents/"+fileName;ZipEntry entry=entries.get(entryName);if(entry==null)throw new Exception("Arquivo ausente durante commit: "+fileName);
          String id=requiredDocText(action.next,"id"),code=requiredDocText(action.next,"code"),finalName=safePart(packageVersion+"__"+runId+"__"+fileName);
          File documentDir=safeChild(documentsRoot,safePart(id));if(!documentDir.mkdirs()&&!documentDir.isDirectory())throw new Exception("Não foi possível criar a pasta do documento "+code+".");
          File destination=safeChild(documentDir,finalName);WriteResult write=streamDocument(archive,entry,destination,extracted);promotedThisRun.add(destination);
          if(write.bytes<=0)throw new Exception("PDF vazio no pacote: "+fileName);if(!expected.isEmpty()&&!expected.equals(write.sha256))throw new Exception("Falha de integridade em "+code+": SHA-256 do PDF não corresponde ao catálogo.");
          action.next.put("file_path",finalName);action.next.put("file",fileName);action.next.put("package_version",packageVersion);action.next.put("sha256",write.sha256);
          done++;notifyProgress("write",done,total,code);
        }
        finalizeCatalog(plan.nextCatalog,manifest,packageVersion,schemaVersion);File parent=catalogTarget.getParentFile();if(parent!=null&&!parent.mkdirs()&&!parent.isDirectory())throw new Exception("Não foi possível preparar o catálogo local.");
        writeAtomically(catalogTarget,plan.nextCatalog.toString());catalogCommitted=true;cleanupUnreferencedFiles(documentsRoot,collectManagedFiles(plan.nextCatalog));
        JSObject result=new JSObject();result.put("catalogVersion",plan.nextCatalog.optString("catalogVersion",packageVersion));result.put("generatedAt",plan.nextCatalog.optString("generatedAt",""));result.put("packageVersion",packageVersion);result.put("documentCount",countActive(plan.nextCatalog.optJSONArray("documents")));result.put("contentBytes",extracted[0]);result.put("mode",mode);return result;
      }
    }catch(Exception error){if(!catalogCommitted)for(File file:promotedThisRun)try{if(file!=null&&file.isFile())file.delete();}catch(Exception ignored){}throw error;}
    finally{deleteRecursively(stagingRoot);}
  }

  private Map<String,ZipEntry> indexEntries(ZipFile archive)throws Exception{
    Map<String,ZipEntry> entries=new LinkedHashMap<>();Set<String> metadata=new HashSet<>();long declaredTotal=0L;Enumeration<? extends ZipEntry> it=archive.entries();int count=0;
    while(it.hasMoreElements()){
      ZipEntry entry=it.nextElement();String name=normalizeEntryName(entry.getName());if(entry.isDirectory()||name.isEmpty())continue;if(entries.put(name,entry)!=null)throw new Exception("Pacote contém entrada duplicada: "+name);count++;
      String base=baseName(name);if(MANIFEST.equals(base)||CATALOG.equals(base)){if(!metadata.add(base))throw new Exception("Pacote contém metadado duplicado: "+base);}
      long declared=entry.getSize();if(declared>0){declaredTotal+=declared;ensureExtractionLimit(declaredTotal);}if(count%100==0)notifyProgress("scan",count,0,name);
    }return entries;
  }

  private ZipEntry metadataEntry(Map<String,ZipEntry> entries,String base){for(Map.Entry<String,ZipEntry> row:entries.entrySet())if(base.equals(baseName(row.getKey())))return row.getValue();return null;}

  private CatalogPlan buildPlan(JSONObject previous,JSONObject incoming,JSONObject manifest,String mode,int schemaVersion)throws Exception{
    boolean incremental="incremental".equals(mode);if(incremental&&(previous==null||previous.optJSONArray("documents")==null))throw new Exception("Pacote incremental exige um catálogo base instalado.");
    JSONArray previousDocs=previous==null?new JSONArray():previous.optJSONArray("documents");if(previousDocs==null)previousDocs=new JSONArray();
    Map<String,JSONObject> byId=new HashMap<>(),byKey=new HashMap<>();for(int i=0;i<previousDocs.length();i++){JSONObject d=previousDocs.optJSONObject(i);if(d==null)continue;String id=cleanText(d.optString("id",""));if(!id.isEmpty())byId.put(id,d);byKey.put(identityKey(d),d);}
    LinkedHashMap<String,JSONObject> next=new LinkedHashMap<>();if(incremental)for(int i=0;i<previousDocs.length();i++){JSONObject d=previousDocs.optJSONObject(i);if(d!=null)next.put(cleanText(d.optString("id","")),cloneJson(d));}
    List<DocumentAction> actions=new ArrayList<>();Set<String> incomingIds=new HashSet<>();JSONArray incomingDocs=incoming.getJSONArray("documents");
    for(int i=0;i<incomingDocs.length();i++){
      JSONObject raw=incomingDocs.getJSONObject(i),candidate=cloneJson(raw);String incomingId=requiredDocText(candidate,"id");JSONObject idMatch=byId.get(incomingId),keyMatch=byKey.get(identityKey(candidate));
      if(idMatch!=null&&keyMatch!=null&&!cleanText(idMatch.optString("id","")).equals(cleanText(keyMatch.optString("id",""))))throw new Exception("Conflito de identidade para "+requiredDocText(candidate,"code")+": ID e código apontam para documentos diferentes.");
      JSONObject existing=idMatch!=null?idMatch:keyMatch;if(existing!=null&&!cleanText(existing.optString("id","")).equals(incomingId)){incomingId=requiredDocText(existing,"id");candidate.put("id",incomingId);}if(!incomingIds.add(incomingId))throw new Exception("ID duplicado no pacote: "+incomingId);
      int revision=existing==null?1:compareRevision(candidate.optString("revision",""),existing.optString("revision",""));if(existing!=null&&revision<0)throw new Exception("Revisão regressiva para "+requiredDocText(candidate,"code")+": instalada "+existing.optString("revision","—")+", recebida "+candidate.optString("revision","—")+".");
      boolean active=isActive(candidate),reuse=false,verify=false;String incomingSha=cleanText(candidate.optString("sha256","")).toLowerCase(Locale.ROOT),existingSha=existing==null?"":cleanText(existing.optString("sha256","")).toLowerCase(Locale.ROOT);
      if(existing!=null&&active&&revision==0&&!incomingSha.isEmpty()){if(!existingSha.isEmpty()){if(!incomingSha.equals(existingSha))throw new Exception("Conflito de integridade em "+requiredDocText(candidate,"code")+": a mesma revisão possui SHA-256 diferente.");reuse=true;}else verify=true;}
      JSONObject merged=existing==null?new JSONObject():cloneJson(existing);copyJson(candidate,merged);if((reuse||verify)&&existing!=null){copyIfPresent(existing,merged,"file_path");copyIfPresent(existing,merged,"package_version");if(incomingSha.isEmpty())copyIfPresent(existing,merged,"sha256");}if(!active)merged.put("file_path","");
      next.put(incomingId,merged);actions.add(new DocumentAction(candidate,merged,existing,active,reuse,verify));
    }
    if(!incremental){next.clear();for(DocumentAction action:actions)next.put(requiredDocText(action.next,"id"),action.next);}
    JSONObject nextCatalog=incremental?cloneJson(previous):cloneJson(incoming);nextCatalog.put("documents",new JSONArray(next.values()));nextCatalog.put("systems",mergeSystems(previous,incoming,incremental));
    return new CatalogPlan(nextCatalog,actions);
  }

  private JSONArray mergeSystems(JSONObject previous,JSONObject incoming,boolean incremental)throws Exception{
    if(!incremental)return incoming.optJSONArray("systems")!=null?cloneArray(incoming.optJSONArray("systems")):new JSONArray();
    LinkedHashMap<String,JSONObject> rows=new LinkedHashMap<>();JSONArray old=previous==null?null:previous.optJSONArray("systems"),add=incoming.optJSONArray("systems");
    if(old!=null)for(int i=0;i<old.length();i++){JSONObject s=old.optJSONObject(i);if(s!=null)rows.put(systemKey(s),cloneJson(s));}if(add!=null)for(int i=0;i<add.length();i++){JSONObject s=add.optJSONObject(i);if(s!=null)rows.put(systemKey(s),cloneJson(s));}return new JSONArray(rows.values());
  }

  private void validateCatalog(JSONArray docs,Map<String,ZipEntry> entries,int schema,String mode)throws Exception{
    Set<String> ids=new HashSet<>(),keys=new HashSet<>();for(int i=0;i<docs.length();i++){JSONObject d=docs.getJSONObject(i);String id=requiredDocText(d,"id"),code=requiredDocText(d,"code");requiredDocText(d,"title");requiredDocText(d,"revision");String file=documentFileName(d);if(!ids.add(id))throw new Exception("ID duplicado no catálogo: "+id);String key=identityKey(d);if(!keys.add(key))throw new Exception("Código duplicado no mesmo sistema: "+code);String hash=cleanText(d.optString("sha256","")).toLowerCase(Locale.ROOT);if(!hash.isEmpty()&&!hash.matches("[a-f0-9]{64}"))throw new Exception("SHA-256 inválido para "+code+".");if(isActive(d)&&(schema>=2||"incremental".equals(mode))&&hash.isEmpty())throw new Exception("Pacote sem SHA-256 para "+code+".");if(isActive(d)){ZipEntry entry=entries.get("documents/"+file);if(entry==null)throw new Exception("Pacote incompleto: PDF não encontrado para "+code+".");if(entry.getSize()==0)throw new Exception("PDF vazio no pacote: "+file);}}
  }

  private WriteResult streamDocument(ZipFile archive,ZipEntry entry,File destination,long[] extracted)throws Exception{
    ensureFreeSpace(destination.getParentFile());File temp=new File(destination.getParentFile(),destination.getName()+".tmp");if(temp.exists()&&!temp.delete())throw new Exception("Não foi possível substituir arquivo temporário.");MessageDigest digest=MessageDigest.getInstance("SHA-256");long written=0L;
    try(InputStream input=new BufferedInputStream(archive.getInputStream(entry),BUFFER_SIZE);BufferedOutputStream out=new BufferedOutputStream(new FileOutputStream(temp),BUFFER_SIZE)){byte[] buffer=new byte[BUFFER_SIZE];int read;while((read=input.read(buffer))!=-1){out.write(buffer,0,read);digest.update(buffer,0,read);written+=read;extracted[0]+=read;ensureExtractionLimit(extracted[0]);}}
    if(written<=0){temp.delete();throw new Exception("PDF vazio no pacote: "+entry.getName());}if(destination.exists()&&!destination.delete()){temp.delete();throw new Exception("Não foi possível substituir documento anterior.");}if(!temp.renameTo(destination)){copyFile(temp,destination);temp.delete();}return new WriteResult(written,hex(digest.digest()));
  }

  private void preserveInstalledFile(DocumentAction action)throws Exception{if(action.existing==null)return;copyIfPresent(action.existing,action.next,"file_path");copyIfPresent(action.existing,action.next,"package_version");copyIfPresent(action.existing,action.next,"sha256");}
  private File managedFile(File root,JSONObject doc)throws Exception{String id=cleanText(doc.optString("id","")),path=cleanText(doc.optString("file_path",""));if(id.isEmpty()||path.isEmpty())return null;return safeChild(safeChild(root,safePart(id)),safePart(path));}
  private String sha256File(File file)throws Exception{MessageDigest digest=MessageDigest.getInstance("SHA-256");try(InputStream input=new BufferedInputStream(new FileInputStream(file),BUFFER_SIZE)){byte[] buffer=new byte[BUFFER_SIZE];int read;while((read=input.read(buffer))!=-1)digest.update(buffer,0,read);}return hex(digest.digest());}
  private String hex(byte[] bytes){StringBuilder out=new StringBuilder(bytes.length*2);for(byte b:bytes)out.append(String.format(Locale.ROOT,"%02x",b&0xff));return out.toString();}

  private int compareRevision(String left,String right){String a=fold(left),b=fold(right);if(a.equals(b))return 0;if(a.isEmpty())return-1;if(b.isEmpty())return 1;List<String> aa=tokens(a),bb=tokens(b);for(int i=0;i<Math.max(aa.size(),bb.size());i++){if(i>=aa.size())return-1;if(i>=bb.size())return 1;String x=aa.get(i),y=bb.get(i);if(x.equals(y))continue;boolean xn=x.matches("\\d+"),yn=y.matches("\\d+");if(xn&&yn){int c=new BigInteger(x).compareTo(new BigInteger(y));if(c!=0)return c<0?-1:1;continue;}int c=x.compareTo(y);if(c!=0)return c<0?-1:1;}return a.compareTo(b)<0?-1:1;}
  private List<String> tokens(String value){List<String> result=new ArrayList<>();Matcher m=REVISION_TOKEN.matcher(value);while(m.find())result.add(m.group());return result;}
  private String fold(String value){return cleanText(value).toUpperCase(new Locale("pt","BR"));}
  private String identityKey(JSONObject d){String code=fold(d.optString("code","")).replaceAll("[^A-Z0-9]",""),system=fold(d.optString("system_id",d.optString("system_name","")));return code+"|"+system;}
  private String systemKey(JSONObject s){String id=cleanText(s.optString("id",""));return id.isEmpty()?fold(s.optString("name","")):id;}

  private void finalizeCatalog(JSONObject catalog,JSONObject manifest,String packageVersion,int schema)throws Exception{catalog.put("schemaVersion",catalog.optInt("schemaVersion",schema));if(cleanText(catalog.optString("catalogVersion","")).isEmpty())catalog.put("catalogVersion",packageVersion);if(cleanText(catalog.optString("generatedAt","")).isEmpty())catalog.put("generatedAt",manifest.optString("createdAt",""));catalog.put("packageVersion",packageVersion);}
  private JSONObject readExistingCatalog(File file){if(!file.isFile())return null;try(FileInputStream input=new FileInputStream(file);ByteArrayOutputStream out=new ByteArrayOutputStream()){byte[] buffer=new byte[32*1024];int read;while((read=input.read(buffer))!=-1)out.write(buffer,0,read);return new JSONObject(out.toString(StandardCharsets.UTF_8.name()));}catch(Exception ignored){return null;}}
  private String readMetadataEntry(ZipFile archive,ZipEntry entry,long[] extracted)throws Exception{try(InputStream input=new BufferedInputStream(archive.getInputStream(entry),BUFFER_SIZE);ByteArrayOutputStream out=new ByteArrayOutputStream()){byte[] buffer=new byte[BUFFER_SIZE];int read;long total=0;while((read=input.read(buffer))!=-1){total+=read;extracted[0]+=read;ensureExtractionLimit(extracted[0]);if(total>MAX_METADATA_BYTES)throw new Exception(entry.getName()+" excede o limite seguro de metadados.");out.write(buffer,0,read);}String value=out.toString(StandardCharsets.UTF_8.name());if(value.startsWith("\uFEFF"))value=value.substring(1);if(value.trim().isEmpty())throw new Exception(baseName(entry.getName())+" está vazio no pacote.");return value;}}
  private JSONObject parseJsonObject(String name,String value)throws Exception{try{return new JSONObject(value);}catch(Exception error){throw new Exception(name+" contém JSON inválido: "+error.getMessage(),error);}}

  private Set<String> collectManagedFiles(JSONObject catalog){Set<String> files=new HashSet<>();if(catalog==null)return files;JSONArray docs=catalog.optJSONArray("documents");if(docs==null)return files;for(int i=0;i<docs.length();i++){JSONObject d=docs.optJSONObject(i);if(d==null)continue;String id=cleanText(d.optString("id","")),path=cleanText(d.optString("file_path",""));if(!id.isEmpty()&&!path.isEmpty())files.add(safePart(id)+"/"+safePart(path));}return files;}
  private void cleanupUnreferencedFiles(File root,Set<String> keep){if(root==null||!root.isDirectory())return;File[] dirs=root.listFiles();if(dirs==null)return;for(File dir:dirs){if(!dir.isDirectory()){dir.delete();continue;}File[] files=dir.listFiles();if(files!=null)for(File file:files){String relative=dir.getName()+"/"+file.getName();if(file.isFile()&&!keep.contains(relative))file.delete();else if(file.isDirectory())deleteRecursively(file);}File[] remaining=dir.listFiles();if(remaining==null||remaining.length==0)dir.delete();}}
  private int countActive(JSONArray docs){if(docs==null)return 0;int count=0;for(int i=0;i<docs.length();i++)if(isActive(docs.optJSONObject(i)))count++;return count;}
  private boolean isActive(JSONObject d){if(d==null)return false;String status=cleanText(d.optString("status","active")).toLowerCase(Locale.ROOT);return d.optBoolean("active",true)&&"active".equals(status);}
  private String documentFileName(JSONObject d)throws Exception{String file=cleanText(d.optString("file",d.optString("file_path","")));if(file.isEmpty()||"null".equalsIgnoreCase(file))throw new Exception("Há documento com campos obrigatórios ausentes no catálogo.");String normalized=file.replace('\\','/');while(normalized.startsWith("./"))normalized=normalized.substring(2);if(normalized.startsWith("/")||normalized.contains("\u0000")||!normalized.toLowerCase(Locale.ROOT).endsWith(".pdf"))throw new Exception("Caminho de PDF inválido no catálogo: "+file);String[] parts=normalized.split("/",-1);for(String part:parts)if(part.isEmpty()||".".equals(part)||"..".equals(part))throw new Exception("Caminho de PDF inválido no catálogo: "+file);return normalized;}
  private String requiredDocText(JSONObject d,String key)throws Exception{String value=cleanText(d.optString(key,""));if(value.isEmpty()||"null".equalsIgnoreCase(value))throw new Exception("Há documento com campos obrigatórios ausentes no catálogo.");return value;}
  private String requiredText(JSONObject o,String key,String message)throws Exception{String value=cleanText(o.optString(key,""));if(value.isEmpty())throw new Exception(message);return value;}
  private String normalizeEntryName(String name)throws Exception{String value=name==null?"":name.replace('\\','/');while(value.startsWith("./"))value=value.substring(2);if(value.startsWith("/")||value.contains("../")||value.equals("..")||value.contains("\u0000"))throw new Exception("Pacote contém caminho inseguro.");return value;}
  private String baseName(String path){String normalized=path==null?"":path.replace('\\','/');int slash=normalized.lastIndexOf('/');return slash>=0?normalized.substring(slash+1):normalized;}
  private String cleanText(String value){return value==null?"":value.trim();}
  private String safePart(String value){String cleaned=value==null?"":value.replaceAll("[^a-zA-Z0-9._-]","_");return cleaned.isEmpty()?"_":cleaned;}
  private File safeChild(File root,String relative)throws Exception{File target=new File(root,relative);String rootPath=root.getCanonicalPath()+File.separator,targetPath=target.getCanonicalPath();if(!targetPath.startsWith(rootPath))throw new Exception("Pacote contém caminho inseguro.");return target;}
  private void ensureExtractionLimit(long bytes)throws Exception{if(bytes>MAX_TOTAL_UNCOMPRESSED_BYTES)throw new Exception("Pacote excede o limite seguro de conteúdo descompactado.");}
  private void ensureFreeSpace(File root)throws Exception{long usable=root.getUsableSpace();if(usable>0&&usable<MIN_FREE_BYTES)throw new Exception("Não há espaço livre suficiente para concluir a atualização.");}
  private void copySelectedPackage(Uri uri,File target)throws Exception{ensureFreeSpace(target.getParentFile());try(InputStream input=new BufferedInputStream(getContext().getContentResolver().openInputStream(uri),BUFFER_SIZE);BufferedOutputStream output=new BufferedOutputStream(new FileOutputStream(target),BUFFER_SIZE)){if(input==null)throw new Exception("Não foi possível abrir o pacote selecionado.");byte[] buffer=new byte[BUFFER_SIZE];int read;long copied=0;while((read=input.read(buffer))!=-1){output.write(buffer,0,read);copied+=read;if((copied&((16L*1024L*1024L)-1L))<BUFFER_SIZE)ensureFreeSpace(target.getParentFile());}if(copied<=0)throw new Exception("O pacote selecionado está vazio.");}catch(NullPointerException error){throw new Exception("Não foi possível abrir o pacote selecionado.",error);}}
  private void copyFile(File source,File destination)throws Exception{try(BufferedInputStream input=new BufferedInputStream(new FileInputStream(source),BUFFER_SIZE);BufferedOutputStream output=new BufferedOutputStream(new FileOutputStream(destination),BUFFER_SIZE)){byte[] buffer=new byte[BUFFER_SIZE];int read;while((read=input.read(buffer))!=-1)output.write(buffer,0,read);}}
  private void writeAtomically(File target,String content)throws Exception{File temp=new File(target.getParentFile(),target.getName()+".tmp");try(BufferedOutputStream out=new BufferedOutputStream(new FileOutputStream(temp),32*1024)){out.write(content.getBytes(StandardCharsets.UTF_8));}if(target.exists()){File backup=new File(target.getParentFile(),target.getName()+".bak");if(backup.exists())backup.delete();if(!target.renameTo(backup))throw new Exception("Não foi possível preservar o catálogo anterior.");if(!temp.renameTo(target)){backup.renameTo(target);throw new Exception("Não foi possível ativar o novo catálogo.");}backup.delete();}else if(!temp.renameTo(target))throw new Exception("Não foi possível ativar o novo catálogo.");}
  private void notifyProgress(String phase,int done,int total,String code){JSObject p=new JSObject();p.put("phase",phase);p.put("done",done);p.put("total",total);if(code!=null)p.put("code",code);notifyListeners("progress",p);}
  private String userMessage(Exception error){String message=error.getMessage()==null?error.toString():error.getMessage(),lower=message.toLowerCase(Locale.ROOT);if(lower.contains("enospc")||lower.contains("no space")||lower.contains("space left")||lower.contains("espaço livre"))return"Não há espaço suficiente para concluir a atualização.";return"Importação interrompida sem substituir o catálogo ativo: "+message;}
  private void deleteRecursively(File file){if(file==null||!file.exists())return;if(file.isDirectory()){File[] children=file.listFiles();if(children!=null)for(File child:children)deleteRecursively(child);}file.delete();}
  private JSONObject cloneJson(JSONObject value)throws Exception{return new JSONObject(value.toString());}
  private JSONArray cloneArray(JSONArray value)throws Exception{return new JSONArray(value.toString());}
  private void copyJson(JSONObject source,JSONObject target)throws Exception{java.util.Iterator<String> keys=source.keys();while(keys.hasNext()){String key=keys.next();target.put(key,source.get(key));}}
  private void copyIfPresent(JSONObject source,JSONObject target,String key)throws Exception{if(source.has(key))target.put(key,source.get(key));}

  private static final class WriteResult{final long bytes;final String sha256;WriteResult(long b,String s){bytes=b;sha256=s;}}
  private static final class DocumentAction{final JSONObject incoming,next,existing;final boolean active,reuse,verifyExisting;DocumentAction(JSONObject i,JSONObject n,JSONObject e,boolean a,boolean r,boolean v){incoming=i;next=n;existing=e;active=a;reuse=r;verifyExisting=v;}}
  private static final class CatalogPlan{final JSONObject nextCatalog;final List<DocumentAction> actions;CatalogPlan(JSONObject c,List<DocumentAction> a){nextCatalog=c;actions=a;}}
}
