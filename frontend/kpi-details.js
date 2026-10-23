"use strict";
(() => {
 const configs = [
  {id:"lowStockCount",title:"Low Stock Medicines",kind:"low",path:"/medicines/alerts/low-stock"},
  {id:"nearExpiryCount",title:"Expiring Within 90 Days",kind:"near",path:"/medicines/alerts/near-expiry?days=90"},
  {id:"expiredMedicinesCount",title:"Expired Medicines",kind:"expired",path:"/medicines"}
 ];
 const modal=document.createElement("div");modal.className="kpi-detail-overlay";modal.hidden=true;
 modal.innerHTML='<section class="kpi-detail-dialog" role="dialog" aria-modal="true" aria-labelledby="kpiDetailTitle"><header class="kpi-detail-header"><div><h2 id="kpiDetailTitle"></h2><p id="kpiDetailSummary" role="status"></p></div><button type="button" id="kpiDetailClose" aria-label="Close medicine details">×</button></header><div class="kpi-detail-scroll"><table><thead id="kpiDetailHead"></thead><tbody id="kpiDetailRows"></tbody></table></div></section>';
 document.body.append(modal);
 const $=id=>document.getElementById(id);
 let previousFocus=null,requestNumber=0;
 const close=()=>{requestNumber++;modal.hidden=true;previousFocus?.focus?.();};
 $("kpiDetailClose").addEventListener("click",close);
 modal.addEventListener("click",e=>{if(e.target===modal)close();});
 document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!modal.hidden)close();});
 const cell=(row,text)=>{const td=document.createElement("td");td.textContent=String(text??"—");row.append(td);};
 const utcDay=value=>{const date=new Date(value);return Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate());};
 const format=value=>{const date=new Date(value);return Number.isNaN(date.getTime())?"—":date.toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"});};
 const dayDifference=value=>Math.round((utcDay(value)-utcDay(new Date()))/86400000);
 const buildHeader=kind=>{const tr=document.createElement("tr");for(const label of (kind==="low"?["Medicine name","Batch","Quantity","Reorder level"]:["Medicine name","Batch","Expiry date",kind==="expired"?"Days overdue":"Days left"])) {const th=document.createElement("th");th.textContent=label;tr.append(th);} $("kpiDetailHead").replaceChildren(tr);};
 const open=async (config,card)=>{
   previousFocus=card;const id=++requestNumber;
   modal.hidden=false;$("kpiDetailTitle").textContent=config.title;
   $("kpiDetailSummary").textContent="Loading medicines…";$("kpiDetailRows").replaceChildren();buildHeader(config.kind);
   $("kpiDetailClose").focus();
   try{
     const response=await fetch("/api"+config.path,{headers:{Authorization:"Bearer "+authToken}});
     const data=await response.json();
     if(!response.ok)throw Error(data.message||"Could not load medicines.");
     if(id!==requestNumber)return;
     let list=data.medicines||[];
     if(config.kind==="expired")list=list.filter(m=>m.expiryDate&&dayDifference(m.expiryDate)<0);
     if(config.kind==="near")list=list.filter(m=>m.expiryDate&&dayDifference(m.expiryDate)>=0&&dayDifference(m.expiryDate)<=90);
     if(config.kind==="low")list=list.filter(m=>m.status==="active");
     list.sort((a,b)=>config.kind==="low"?(a.quantity-b.quantity):new Date(a.expiryDate)-new Date(b.expiryDate));
     const rows=$("kpiDetailRows");
     for(const medicine of list){
       const tr=document.createElement("tr");
       cell(tr,medicine.medicineName);cell(tr,medicine.batchNumber);
       if(config.kind==="low"){cell(tr,medicine.quantity);cell(tr,medicine.reorderLevel);}
       else{const days=dayDifference(medicine.expiryDate);cell(tr,format(medicine.expiryDate));cell(tr,config.kind==="expired"?Math.abs(days)+" day(s) overdue":days===0?"Expires today":days+" day(s) left");}
       rows.append(tr);
     }
     if(!list.length){const tr=document.createElement("tr");const td=document.createElement("td");td.colSpan=4;td.textContent="No matching medicines.";tr.append(td);rows.append(tr);}
     $("kpiDetailSummary").textContent=list.length+" matching medicine batch(es)";
   }catch(error){if(id===requestNumber)$("kpiDetailSummary").textContent=error.message;}
 };
 for(const config of configs){
   const count=$(config.id),card=count?.closest(".stat-card");if(!card)continue;
   card.classList.add("kpi-detail-trigger");card.setAttribute("role","button");card.setAttribute("tabindex","0");card.setAttribute("aria-haspopup","dialog");card.setAttribute("aria-label","Show "+config.title);
   card.addEventListener("click",()=>open(config,card));
   card.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();open(config,card);}});
 }
})();
