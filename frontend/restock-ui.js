"use strict";
(() => {
 const $ = id => document.getElementById(id);
 const api = async (path, options={}) => {
   const response=await fetch("/api"+path,{
     ...options,headers:{"Authorization":"Bearer "+authToken,...(options.body?{"Content-Type":"application/json"}:{}),...(options.headers||{})}
   });
   const data=await response.json();
   if(!response.ok)throw Error(data.message||"Request failed.");
   return data;
 };
 const el=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=String(text);return e;};
 const overlay=el("div");overlay.className="restock-overlay";overlay.hidden=true;
 const dialog=el("section");dialog.className="restock-dialog";dialog.setAttribute("role","dialog");dialog.setAttribute("aria-modal","true");
 const title=el("h2","Request Medicine Restock");
 const form=el("form");
 const makeField=(label,value,readOnly=false,type="text")=>{const wrap=el("label");wrap.append(el("span",label));const input=el("input");input.type=type;input.value=value;input.readOnly=readOnly;input.required=true;wrap.append(input);form.append(wrap);return input;};
 const nameInput=makeField("Medicine name","",true);
 const batchInput=makeField("Batch","",true);
 const qtyInput=makeField("Quantity requested","1",false,"number");qtyInput.min="1";qtyInput.max="1000000";qtyInput.step="1";
 const noteWrap=el("label");noteWrap.append(el("span","Note (optional)"));const noteInput=el("textarea");noteInput.maxLength=1000;noteWrap.append(noteInput);form.append(noteWrap);
 const feedback=el("p");feedback.setAttribute("role","status");
 const actions=el("div");actions.className="restock-actions";
 const cancel=el("button","Cancel");cancel.type="button";cancel.className="secondary-btn";
 const submit=el("button","Send to Supplier");submit.type="submit";submit.className="primary-btn";
 actions.append(cancel,submit);form.append(feedback,actions);dialog.append(title,form);overlay.append(dialog);document.body.append(overlay);
 let selected=null, lastButton=null;
 const close=()=>{overlay.hidden=true;lastButton?.focus();};
 cancel.addEventListener("click",close);overlay.addEventListener("click",e=>{if(e.target===overlay)close();});
 document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!overlay.hidden)close();});
 function openForm(medicine,button){
   if(!supplierAvailable)return;
   selected=medicine;lastButton=button;nameInput.value=medicine.medicineName;batchInput.value=medicine.batchNumber;
   qtyInput.value=String(Math.max(1,Number(medicine.reorderLevel||0)-Number(medicine.quantity||0)));
   noteInput.value="";feedback.textContent="";overlay.hidden=false;qtyInput.focus();
 }
 const statuses=new Map();
 let supplierAvailable=false;
 const key=m=>String(m._id);
 async function refreshStatuses(){
   const [data,availability]=await Promise.all([api("/restock-requests"),api("/restock-requests/availability")]);
   supplierAvailable=availability.available;
   statuses.clear();
   for(const request of data.requests){if(request.active||request.status==="Delivered") {
     const k=String(request.medicine);if(!statuses.has(k))statuses.set(k,request);
   }}
   return statuses;
 }
 function updateButton(button,medicine){
   const request=statuses.get(key(medicine));
   button.disabled=Boolean(request)||!supplierAvailable;
   button.textContent=request ? (request.status==="Pending"?"Requested":request.status) : supplierAvailable ? "Order" : "Supplier account not active";
   button.className=request?"restock-status":"secondary-btn restock-order-btn";
   button.title=request?("Request status: "+request.status):supplierAvailable?"Order this medicine":"Supplier account not active";
 }
 async function enhanceLowStock(){
   const modal=$("kpiDetailTitle");if(!modal||modal.textContent!=="Low Stock Medicines")return;
   const header=$("kpiDetailHead")?.querySelector("tr"),tbody=$("kpiDetailRows");
   if(!header||!tbody)return;
   if(!header.querySelector("[data-restock-header]")){const th=el("th","Order");th.dataset.restockHeader="true";header.append(th);}
   let medicines=[];
   try{const [stock]=await Promise.all([api("/medicines/alerts/low-stock"),refreshStatuses()]);medicines=stock.medicines||[];}
   catch(error){$("kpiDetailSummary").textContent=error.message;return;}
   const rows=Array.from(tbody.querySelectorAll("tr"));
   const byNameBatch=new Map(medicines.map(m=>[m.medicineName+"\u0000"+m.batchNumber,m]));
   for(const row of rows){
     if(row.dataset.restockReady)return;
     if(row.cells.length<4)continue;
     const medicine=byNameBatch.get(row.cells[0].textContent+"\u0000"+row.cells[1].textContent);
     if(!medicine)continue;
     const td=el("td"),button=el("button","Order");button.type="button";
     updateButton(button,medicine);
     button.addEventListener("click",()=>openForm(medicine,button));
     td.append(button);row.append(td);row.dataset.restockReady="true";
   }
 }
 form.addEventListener("submit",async e=>{
   e.preventDefault();if(!selected)return;
   const quantity=Number(qtyInput.value);
   if(!Number.isSafeInteger(quantity)||quantity<1||quantity>1000000){feedback.textContent="Enter a valid quantity.";return;}
   submit.disabled=true;feedback.textContent="Sending request…";
   try{
     const data=await api("/restock-requests",{method:"POST",body:JSON.stringify({medicineId:selected._id,quantity,note:noteInput.value})});
     statuses.set(key(selected),data.request);updateButton(lastButton,selected);
     feedback.textContent="Order request sent to supplier";
     const summary=$("kpiDetailSummary");if(summary)summary.textContent="Order request sent to supplier";
     setTimeout(close,1100);
   }catch(error){
     feedback.textContent=error.message;
     if(/already exists/i.test(error.message)){await refreshStatuses().catch(()=>{});updateButton(lastButton,selected);}
   }finally{submit.disabled=false;}
 });
 const observer=new MutationObserver(()=>{
   if($("kpiDetailTitle")?.textContent!=="Low Stock Medicines"||$("kpiDetailRows")?.children.length===0)return;
   if($("kpiDetailRows")?.querySelector("tr:not([data-restock-ready])"))enhanceLowStock();
 });
 const root=$("kpiDetailRows");if(root)observer.observe(root,{childList:true});
})();
