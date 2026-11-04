"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const listeners = new Map(), timers = [], disposers = [];
const input = {
  value: "", textContent: "", isContentEditable: true,
  matches: () => true, closest: () => true,
  getAttribute: () => "false", getBoundingClientRect: () => ({left:0,top:20,width:500,height:24}),
};
const placeholder = {className:"native-placeholder"};
const parent = {querySelector: () => placeholder, append: node => { node.parentElement=parent; node.isConnected=true; }};
input.parentElement=parent;
const answer = {
  innerText:"Нашел причину сбоя в parser.py.",
  matches: () => true,
  querySelectorAll: () => [],
};
const elements = new Set();
function element() {
  const n={dataset:{},style:{},hidden:false,isConnected:false,parentElement:null,textContent:"",
    setAttribute(){},contains(x){return x===n},remove(){elements.delete(n);n.isConnected=false}};
  elements.add(n);
  return n;
}
const document = {
  activeElement:input, documentElement:{}, head:{append(n){n.isConnected=true}},
  querySelectorAll(selector){if(selector.includes("planner-response-text"))return [answer];return []},
  createElement:element,
  execCommand(command,ui,text){if(command!=="insertText")return false;input.textContent=text;return true},
  addEventListener(){}, removeEventListener(){},
};
const window = {
  addEventListener(name,fn){listeners.set(name,fn)},
  removeEventListener(name){listeners.delete(name)},
};
const plugin={onDispose(f){disposers.push(f)}};
class MutationObserver { observe(){} disconnect(){this.disconnected=true} }
const context={window,document,plugin,MutationObserver,location:{protocol:"https:",hostname:"127.0.0.1",pathname:"/c/test"},
  setTimeout(f){timers.push(f);return timers.length},clearTimeout(){},console};
vm.runInNewContext(fs.readFileSync(require.resolve("../tab/index.js"),"utf8"),context);
while(timers.length)timers.shift()();
const chip=[...elements].find(e=>e.dataset.agLocalTab==="1");
assert.ok(chip && !chip.hidden);
assert.match(chip.textContent,/минимальное исправление в parser\.py/i);
assert.equal(input.textContent,"");
const event={key:"Tab",target:input,preventDefault(){this.prevented=true},stopImmediatePropagation(){this.stopped=true}};
listeners.get("keydown")(event);
assert.equal(input.textContent,chip.textContent);
assert.ok(event.prevented && event.stopped);
disposers.forEach(fn=>fn());
assert.equal(listeners.size,0);
assert.equal(window.agLocalTabInstalled,undefined);
assert.ok(!elements.has(chip));
console.log("Tab plugin smoke test passed");
