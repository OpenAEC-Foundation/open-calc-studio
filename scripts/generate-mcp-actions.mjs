import ts from 'typescript';
import fs from 'node:fs';
const config = ts.readConfigFile('tsconfig.json', ts.sys.readFile).config;
const parsed = ts.parseJsonConfigFileContent(config, ts.sys, '.');
const program = ts.createProgram(parsed.fileNames, parsed.options);
const checker = program.getTypeChecker();
function schema(t, seen = new Set()) {
  if (t.isUnion()) {
    const types=t.types.filter(v=>!(v.flags & ts.TypeFlags.Undefined));
    if(types.length===1)return schema(types[0],seen);
    return {anyOf:types.map(v=>schema(v,seen))};
  }
  if(t.flags & ts.TypeFlags.StringLiteral)return {enum:[t.value]};
  if(t.flags & ts.TypeFlags.NumberLiteral)return {enum:[t.value]};
  if(t.flags & ts.TypeFlags.BooleanLiteral)return {enum:[t.intrinsicName==='true']};
  if(t.flags & ts.TypeFlags.StringLike)return {type:'string'};
  if(t.flags & ts.TypeFlags.NumberLike)return {type:'number'};
  if(t.flags & ts.TypeFlags.BooleanLike)return {type:'boolean'};
  if(t.flags & ts.TypeFlags.Null)return {type:'null'};
  if(checker.isArrayType(t))return {type:'array',items:schema(checker.getTypeArguments(t)[0],seen)};
  if(t.flags & (ts.TypeFlags.Any|ts.TypeFlags.Unknown))return {};
  if(t.getCallSignatures().length) throw Error('callback parameter');
  if(seen.has(t)||seen.size>12)return {type:'object'};
  const next=new Set(seen).add(t);
  if(t.flags & ts.TypeFlags.Object || t.isIntersection()) {
    const properties={}, required=[];
    for(const p of t.getProperties()) {
      // Session state is managed by the app/host, never writable MCP input.
      if(p.getJsDocTags().some(tag=>tag.name==='internal'))continue;
      const decl=p.valueDeclaration??p.declarations?.[0]; if(!decl)continue;
      properties[p.name]=schema(checker.getTypeOfSymbolAtLocation(p,decl),next);
      if(!(p.flags&ts.SymbolFlags.Optional))required.push(p.name);
    }
    const index=checker.getIndexTypeOfType(t,ts.IndexKind.String);
    return {type:'object',properties,required,additionalProperties:index?schema(index,next):false};
  }
  return {};
}
const actions={}, excluded={};
for(const source of program.getSourceFiles().filter(f=>/src\/state\/slices\/[^/]+\.ts$/.test(f.fileName))) {
 for(const node of source.statements.filter(ts.isInterfaceDeclaration)) {
  if(!node.name.text.endsWith('Slice'))continue;
  for(const m of node.members) {
   if(!ts.isPropertySignature(m)||!m.type||!ts.isFunctionTypeNode(m.type))continue;
   const name=m.name.getText(source);
   try {
    const params=m.type.parameters.map(p=>({name:p.name.getText(source),optional:!!p.questionToken||!!p.initializer||(checker.getTypeAtLocation(p).isUnion()&&checker.getTypeAtLocation(p).types.some(t=>t.flags & ts.TypeFlags.Undefined)),schema:schema(checker.getTypeAtLocation(p))}));
    actions[name]={group:node.name.text.replace('Slice',''),signature:m.type.getText(source),parameters:params};
   } catch(e) {excluded[name]=e.message;}
  }
 }
}
fs.writeFileSync('src/services/mcp/desktopActions.json',JSON.stringify({actions,excluded},null,2)+'\n');
console.log(`${Object.keys(actions).length} JSON-callable desktop actions; ${Object.keys(excluded).length} callback-only extension hooks excluded`);
