import re, os, collections
os.chdir('/home/claude/campusconnect')
mods=["react","react/jsx-runtime","react-dom/client","react-router-dom","@tanstack/react-query","@supabase/supabase-js","lucide-react","react-hook-form","@hookform/resolvers/zod","zod","vitest","@testing-library/react","@playwright/test"]
names=collections.defaultdict(set)
for root,_,files in os.walk('src'):
    for f in files:
        if f.endswith(('.ts','.tsx')):
            s=open(os.path.join(root,f)).read()
            for m in re.finditer(r'import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+"([^"]+)"',s):
                if m.group(2) in mods:
                    for n in m.group(1).split(','):
                        n=re.sub(r'^type\s+','',n.strip()).split(' as ')[0].strip()
                        if n: names[m.group(2)].add(n)
for f in os.listdir('e2e'):
    for m in re.finditer(r'import\s+\{([^}]*)\}\s+from\s+"(@playwright/test)"',open('e2e/'+f).read()):
        for n in m.group(1).split(','): names[m.group(2)].add(n.strip())
CLASSES={'Component','QueryClient','QueryCache'}
out=[]
for mod in mods:
    body=[]
    for n in sorted(names.get(mod,[])):
        if n=='z': body.append('export const z: any; export namespace z { type infer<T = any> = any; }')
        elif n in CLASSES: body.append(f'export class {n}<A = any, B = any, C = any> {{ constructor(...a: any[]); props: any; state: any; setState(...a: any[]): any; [k: string]: any }}')
        elif n in ('expect','test','describe','it','vi','screen','fireEvent','render'): body.append(f'export const {n}: any;')
        else: body.append(f'export function {n}<A = any, B = any, C = any, D = any>(...a: any[]): any;\n  export type {n}<A = any, B = any, C = any, D = any> = any;')
    out.append(f'declare module "{mod}" {{\n  '+'\n  '.join(body)+'\n}')
out.append('declare module "@testing-library/jest-dom/vitest";\ndeclare module "*.css";')
out.append('interface ImportMetaEnv { readonly VITE_SUPABASE_URL: string; readonly VITE_SUPABASE_PUBLISHABLE_KEY: string; readonly VITE_APP_URL?: string }\ninterface ImportMeta { readonly env: ImportMetaEnv }')
out.append('declare namespace JSX { interface IntrinsicElements { [k: string]: any } interface IntrinsicAttributes { key?: any; children?: any } interface ElementClass { render(): any } interface ElementChildrenAttribute { children: {} } interface Element {} }')
open('/tmp/stubs/stubs.d.ts','w').write('\n'.join(out))
