"use strict";

// Reuses the already-running app. Only model-selector system copy is exported.
// No network interception, credentials, profile content, chat DOM, UI clicks or focus.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { translateAuditedUiCopy } = require("../localize-antigravity-ru.js");

function collectModelCopy(document) {
  const result = { providerFound:false, notificationCards:0, rows:[], applicationInteraction:false, chatDataRead:false };
  const seen = new Set();
  const modelLabels=new Set();
  const protectedArea=element=>{
    for(let current=element;current;current=current.parentElement) {
      if(typeof current.matches==="function" && current.matches("[data-message-id],[data-turn-id],[data-testid*='message'],[contenteditable='true'],article,pre,code,textarea,input,.assistant-message,.user-message,.conversation-message"))return true;
    }
    return false;
  };
  for (const trigger of document.querySelectorAll("[data-testid='model-selector-trigger']")) {
    if(protectedArea(trigger))continue;
    const key = Object.keys(trigger).find(item => item.startsWith("__reactFiber$"));
    let fiber = key && trigger[key];
    for (let depth=0; fiber && depth<60; depth++, fiber=fiber.return) {
      const props = fiber.memoizedProps;
      if (!props || typeof props !== "object" || !Object.hasOwn(props,"value")) continue;
      const value = props.value;
      if (!value || typeof value !== "object" || !["modelOptions","groups","effortIndex","setSelectedModel"].every(name=>Object.hasOwn(value,name))) continue;
      if (!Array.isArray(value.modelOptions) || value.modelOptions.length>200) throw new Error("Unexpected model-selector provider shape");
      result.providerFound=true;
      const options=[...value.modelOptions];
      if(Array.isArray(value.groups)) for(const group of value.groups) {
        if(group && Array.isArray(group.options) && group.options.length<=200) options.push(...group.options);
      }
      if(options.length>1000)throw new Error("Model-copy collection exceeded its bounded limit");
      for (const option of options) {
        if (!option || typeof option !== "object") continue;
        // Read only the three fields rendered by the model badge component.
        const label=option.label, title=option.tagTitle, description=option.tagDescription;
        if (typeof label!=="string" || label.length>160) throw new Error("Invalid model label length");
        modelLabels.add(label);
        for (const [field,text] of [["tagTitle",title],["tagDescription",description]]) {
          if (text===undefined || text===null || text==="") continue;
          if (typeof text!=="string" || text.length>2000) throw new Error("Unexpected system model copy");
          const identity=JSON.stringify([label,field,text]);
          if (!seen.has(identity)) {seen.add(identity);result.rows.push({model:label,field,text});}
        }
      }
      break;
    }
  }
  for(const card of document.querySelectorAll("[data-testid='nux-card']")) {
    if(protectedArea(card))continue;
    // Notification metadata only; never scan document.body or card descendants.
    const key=Object.keys(card).find(item=>item.startsWith("__reactFiber$"));
    let fiber=key && card[key];
    for(let depth=0;fiber && depth<12;depth++,fiber=fiber.return) {
      const props=fiber.memoizedProps;
      if(!props || typeof props!=="object" || !Object.hasOwn(props,"nux"))continue;
      const nux=props.nux;
      if(!nux || typeof nux!=="object")continue;
      result.notificationCards++;
      for(const field of ["title","body"]) {
        const text=nux[field];
        if(text===undefined||text===null||text==="")continue;
        if(typeof text!=="string"||text.length>2000)throw new Error("Unexpected system notification copy");
        const identity=JSON.stringify(["system-notification",field,text]);
        if(!seen.has(identity)){seen.add(identity);result.rows.push({model:"system-notification",field,text});}
      }
      break;
    }
  }
  result.serverModelsInspected=modelLabels.size;
  return result;
}

function analyzeModelCopy(collected) {
  const preservedBadges=new Set(["Medium","Thinking","Economy","High","High accuracy","Low","Fast"]);
  const rows=collected.rows.map(row=>{
    const translation=translateAuditedUiCopy(row.text);
    return {...row,translation,preservedMode:row.field==="tagTitle"&&preservedBadges.has(row.text),requiresReview:!translation&&/[A-Za-z]/.test(row.text)&&!(row.field==="tagTitle"&&preservedBadges.has(row.text))};
  });
  const missing=rows.filter(row=>row.requiresReview);
  return {...collected,rows,missing,copySha256:crypto.createHash("sha256").update(JSON.stringify(collected.rows)).digest("hex"),scope:"System model badge titles/descriptions and loaded nux-card metadata only; unavailable unloaded content remains unverified"};
}

async function readCurrentModelCopy(portFile) {
  if(path.basename(portFile)!=="DevToolsActivePort")throw new Error("Only the existing application's DevToolsActivePort metadata file is accepted");
  const portStat=fs.lstatSync(portFile);
  if(!portStat.isFile() || portStat.isSymbolicLink() || portStat.size>4096)throw new Error("Unexpected debug metadata file");
  const port=Number(fs.readFileSync(portFile,"utf8").split(/\r?\n/)[0]);
  if(!Number.isInteger(port)||port<1||port>65535)throw new Error("Invalid existing app debug endpoint");
  const targets=await(await fetch(`http://127.0.0.1:${port}/json/list`,{signal:AbortSignal.timeout(5000)})).json();
  const target=targets.find(item=>item.type==="page"&&item.webSocketDebuggerUrl&&(()=>{try{return new URL(item.url).hostname==="127.0.0.1";}catch{return false;}})());
  if(!target)throw new Error("Existing application renderer unavailable; do not launch it for an audit");
  const socketUrl=new URL(target.webSocketDebuggerUrl);
  if(socketUrl.protocol!=="ws:" || socketUrl.hostname!=="127.0.0.1" || Number(socketUrl.port)!==port || !socketUrl.pathname.startsWith("/devtools/page/") || socketUrl.username || socketUrl.password || socketUrl.search || socketUrl.hash)throw new Error("Unexpected application debug channel");
  const socket=new WebSocket(target.webSocketDebuggerUrl);
  try {
    await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error("App connection timeout")),5000);socket.addEventListener("open",()=>{clearTimeout(timer);resolve();},{once:true});socket.addEventListener("error",()=>{clearTimeout(timer);reject(new Error("App connection failed"));},{once:true});});
    const response=await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error("Read-only UI audit timeout")),5000);
      socket.addEventListener("message",event=>{const data=JSON.parse(String(event.data));if(data.id!==1)return;clearTimeout(timer);data.error?reject(new Error(data.error.message)):resolve(data.result);});
      socket.send(JSON.stringify({id:1,method:"Runtime.evaluate",params:{returnByValue:true,expression:`(${collectModelCopy.toString()})(document)`}}));
    });
    if(response.exceptionDetails||!response.result?.value)throw new Error("Model UI collection failed");
    return analyzeModelCopy(response.result.value);
  } finally {socket.close();}
}

async function main() {
  const args=process.argv.slice(2);
  if(args.includes("--help")){console.log("node scripts/audit-runtime-ui.js --port-file <existing Antigravity DevToolsActivePort> --out <local evidence.json>\nReads only system model badges from an already-running application. No launch, UI changes, profile or chats.");return;}
  const value=name=>{const i=args.indexOf(name);if(i<0||!args[i+1])throw new Error("Missing "+name);return args[i+1];};
  const report=await readCurrentModelCopy(path.resolve(value("--port-file")));
  fs.writeFileSync(path.resolve(value("--out")),JSON.stringify(report,null,2)+"\n");
  console.log(JSON.stringify({providerFound:report.providerFound,systemCopyRows:report.rows.length,missing:report.missing.length,copySha256:report.copySha256,applicationInteraction:false,chatDataRead:false}));
  if(!report.providerFound)throw new Error("Model provider not loaded; runtime coverage is incomplete");
  if(report.missing.length)throw new Error(`${report.missing.length} untranslated server model notices: review the local report before release`);
}

module.exports={collectModelCopy,analyzeModelCopy};
if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=1;});
