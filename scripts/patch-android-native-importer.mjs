import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const root=resolve(new URL('..',import.meta.url).pathname);
const template=resolve(root,'native/android/NativePackageImporterPlugin.java');
const javaDir=resolve(root,'android/app/src/main/java/com/byd/skyrail/documents');
const pluginTarget=resolve(javaDir,'NativePackageImporterPlugin.java');
const mainActivity=resolve(javaDir,'MainActivity.java');

await mkdir(javaDir,{recursive:true});
await writeFile(pluginTarget,await readFile(template,'utf8'),'utf8');

let main=await readFile(mainActivity,'utf8');
if(!main.includes('registerPlugin(NativePackageImporterPlugin.class)')){
  if(/public class MainActivity extends BridgeActivity \{\s*\}/s.test(main)){
    main=main.replace(/public class MainActivity extends BridgeActivity \{\s*\}/s,`public class MainActivity extends BridgeActivity {\n  @Override\n  public void onCreate(android.os.Bundle savedInstanceState) {\n    registerPlugin(NativePackageImporterPlugin.class);\n    super.onCreate(savedInstanceState);\n  }\n}`);
  }else if(main.includes('super.onCreate(savedInstanceState);')){
    main=main.replace('super.onCreate(savedInstanceState);','registerPlugin(NativePackageImporterPlugin.class);\n    super.onCreate(savedInstanceState);');
  }else{
    throw new Error('Formato inesperado de MainActivity.java; registro do plugin não aplicado.');
  }
  await writeFile(mainActivity,main,'utf8');
}

console.log('BYD Skyrail: NativePackageImporter injetado no projeto Android.');
