// DOM, math and colour-token helpers.
"use strict";

const $ = s => document.querySelector(s);
const V3 = THREE.Vector3;
const clamp = (x,a,b) => x<a?a:x>b?b:x;
const lerp = (a,b,t) => a+(b-a)*t;
const DEG = Math.PI/180;
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;}}
const css = k => getComputedStyle(document.documentElement).getPropertyValue(k).trim();
