"use strict";
(()=>{
 const $=id=>document.getElementById(id),node=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=String(text);return n;};
 const api=async(path,options={})=>{const response=await fetch("http://localhost:5000/api"+path,{...options,headers:{Authorization:"Bearer "+authToken,...(options.body?{"Content-Type":"application/json"}:{})}});const data=await response.json();if(!response.ok)throw Error(data.message||"Request failed");return data;};
 const panel=$("supplierPortalPanel");if(!panel)return;
 const shell=node("div");shell.className="supplier-workspace";
 const header=node("div");header.className="supplier-welcome";shell.append(header);
 const tabs=node("nav");tabs.className="supplier-tabs";shell.append(tabs);
 const content=node("div");shell.append(content);
 panel.prepend(shell);
 const menu=["Dashboard","Purchase Orders","Delivery Tracking","Order History","Notifications","Company Profile","Help & Support","Logout"];
 let view="Dashboard";
 const show=async name=>{if(name==="Logout"){document.getElementById("logoutBtn")?.click();return;}view=name;await render();};
 for(const name of menu){const b=node("button",name);b.type="button";b.addEventListener("click",()=>show(name));tabs.append(b);}
 const fmt=d=>d?new Date(d).toLocaleDateString("en-IN"):"—";
 const orderCard=(order,detail=false)=>{
  const card=node("article");card.className="supplier-order-card";
  card.append(node("strong",order.purchaseOrderNumber||order._id));
  card.append(node("span",order.medicineName+" · Batch "+order.batchNumber+" · "+order.quantityRequested+" unit(s)"));
  card.append(node("span","Status: "+order.status));
  card.append(node("small","Expected: "+fmt(order.expectedDeliveryDate||order.estimatedDeliveryDate)));
  if(detail){
   if(order.status==="Pending")action(card,"Acknowledge / Accept",async()=>api("/supplier/orders/"+order._id+"/accept",{method:"PATCH"}));
   if(order.status==="Accepted")action(card,"Dispatch",async()=>{
     const dispatchDate=prompt("Dispatch date (YYYY-MM-DD)",new Date().toISOString().slice(0,10));
     if(dispatchDate===null)return;const estimatedDeliveryDate=prompt("Estimated delivery date (YYYY-MM-DD)");if(estimatedDeliveryDate===null)return;
     const trackingReference=prompt("Tracking / delivery reference");if(trackingReference===null)return;
     return api("/supplier/orders/"+order._id+"/dispatch",{method:"PATCH",body:JSON.stringify({dispatchDate,estimatedDeliveryDate,trackingReference})});
   });
   if(order.status==="Dispatched")action(card,"Mark as Delivered",async()=>api("/supplier/orders/"+order._id+"/deliver",{method:"PATCH"}));
   if(order.history?.length){const h=node("small","History: "+order.history.map(x=>x.status+" ("+fmt(x.at)+")").join(" → "));card.append(h);}
  }
  return card;
 };
 function action(parent,label,fn){const b=node("button",label);b.type="button";b.className="secondary-btn";b.addEventListener("click",async()=>{b.disabled=true;try{await fn();await render();}catch(e){alert(e.message);b.disabled=false;}});parent.append(b);}
 async function render(){
  if(typeof currentUser==="undefined"||currentUser?.role!=="supplier"||panel.hidden)return;
  content.replaceChildren();header.replaceChildren();
  header.append(node("h2","Welcome back, "+currentUser.name));
  header.append(node("p","Here is an overview of your purchase orders and deliveries."));
  [...tabs.children].forEach(b=>b.classList.toggle("active",b.textContent===view));
  try{
   if(view==="Dashboard"){
    const data=await api("/supplier/dashboard");
    const stats=node("div");stats.className="supplier-stats";
    for(const [label,value] of [["Total Orders",data.summary.total],["Pending Orders",data.summary.pending],["In Transit",data.summary.inTransit],["Delivered",data.summary.delivered]]){const c=node("article");c.append(node("span",label),node("h3",value));stats.append(c);}content.append(stats);
    const heading=node("h3","Recent Purchase Orders");content.append(heading);
    if(!data.recent.length)content.append(node("p","No purchase orders yet"));
    data.recent.forEach(o=>content.append(orderCard(o)));
    action(content,"View all",()=>show("Purchase Orders"));
    const quick=node("h3","Quick Actions");content.append(quick);
    for(const name of ["Purchase Orders","Delivery Tracking","Company Profile"])action(content,name,()=>show(name));
   }else if(["Purchase Orders","Delivery Tracking","Order History"].includes(view)){
    const data=await api("/supplier/orders");
    const filtered=data.orders.filter(o=>view==="Delivery Tracking"?["Accepted","Dispatched","Delivered"].includes(o.status):view==="Order History"?["Delivered","Received","Partially Received","Rejected"].includes(o.status):true);
    content.append(node("h3",view));if(!filtered.length)content.append(node("p","No purchase orders yet"));
    filtered.forEach(o=>content.append(orderCard(o,true)));
   }else if(view==="Notifications"){
    content.append(node("h3","Notifications"));const data=await api("/supplier/notifications");
    if(!data.notifications.length)content.append(node("p","No notifications yet"));
    for(const n of data.notifications){const c=node("article");c.className="supplier-order-card";c.append(node("span",n.message),node("small",fmt(n.createdAt)+(n.read?" · Read":" · Unread")));if(!n.read)action(c,"Mark read",async()=>api("/supplier/notifications/"+n._id+"/read",{method:"PATCH"}));content.append(c);}
   }else if(view==="Company Profile"){
    const data=await api("/supplier-accounts/me");const p=data.supplier;
    content.append(node("h3","Company Profile"));for(const [k,v] of Object.entries({Company:p.supplierName,Contact:p.contactPerson,Email:p.email,Phone:p.phone,Address:p.address,Status:p.status}))content.append(node("p",k+": "+(v||"—")));
   }else{content.append(node("h3","Help & Support"));content.append(node("p","Contact your pharmacy administrator for assistance with orders or account access."));}
  }catch(e){content.append(node("p",e.message));}
 }
 const observer=new MutationObserver(()=>{if(!panel.hidden)render();});observer.observe(panel,{attributes:true,attributeFilter:["hidden"]});
 const purchase=$("purchasesSection");if(purchase){
  const area=node("section");area.className="supplier-admin-orders";area.append(node("h3","Supplier Purchase Orders"));const list=node("div");area.append(list);purchase.append(area);
  async function loadAdmin(){
   if(purchase.hidden||currentUser?.role!=="admin")return;
   try{const data=await api("/admin/purchase-orders/orders");list.replaceChildren();
    for(const o of data.orders){const c=orderCard(o);c.append(node("small","Supplier: "+(o.supplier?.supplierName||"—")));
      if(["Delivered","Partially Received"].includes(o.status))action(c,"Verify & Receive",async()=>{
       const quantity=Number(prompt("Actual received quantity",String(o.quantityRequested-(o.receivedQuantity||0))));if(!Number.isSafeInteger(quantity)||quantity<1)return;
       const batchNumber=prompt("Verified batch number",o.batchNumber);if(batchNumber===null)return;
       const expiryDate=prompt("Verified expiry date (YYYY-MM-DD)");if(expiryDate===null)return;
       return api("/admin/purchase-orders/orders/"+o._id+"/receive",{method:"POST",body:JSON.stringify({quantity,batchNumber,expiryDate})});
      });list.append(c);
    }
   }catch(e){list.replaceChildren(node("p",e.message));}
  }
  const watch=new MutationObserver(()=>{if(!purchase.hidden)loadAdmin();});watch.observe(purchase,{attributes:true,attributeFilter:["hidden"]});
  const refresh=$("refreshPurchasesBtn");refresh?.addEventListener("click",()=>setTimeout(loadAdmin,100));
 }
})();
