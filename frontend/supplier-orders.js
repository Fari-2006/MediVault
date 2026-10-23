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
 const show=async name=>{if(name==="Logout"){document.getElementById("logoutBtn")?.click();return;}view=name;syncSidebar();await render();};
 for(const name of menu){const b=node("button",name);b.type="button";b.addEventListener("click",()=>show(name));tabs.append(b);}
 const sidebar=document.querySelector(".navigation");
 if(sidebar){
  for(const name of menu){
   const link=node("a",name);link.href="#supplier-"+name.toLowerCase().replace(/[^a-z]+/g,"-");link.className="nav-link supplier-only-nav";link.hidden=true;
   link.addEventListener("click",e=>{e.preventDefault();if(currentUser?.role==="supplier")show(name);});
   sidebar.append(link);
  }
 }
 const syncSidebar=()=>{
  const supplier=typeof currentUser!=="undefined"&&currentUser?.role==="supplier"&&typeof authToken!=="undefined"&&!!authToken;
  document.querySelectorAll(".supplier-only-nav").forEach(link=>{link.hidden=!supplier;link.classList.toggle("active",supplier&&link.textContent===view);});
  if(supplier)document.querySelectorAll('.navigation [data-page="supplier-portal"]').forEach(link=>link.hidden=true);
 };

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
  syncSidebar();
  content.replaceChildren();header.replaceChildren();
  header.append(node("h2","Welcome back, "+currentUser.name));
  header.append(node("p","Here is an overview of your purchase orders and deliveries."));
  [...tabs.children].forEach(b=>b.classList.toggle("active",b.textContent===view));
  try{
   if(view==="Dashboard"){
    const [data,notifications]=await Promise.all([api("/supplier/dashboard"),api("/supplier/notifications")]);
    const stats=node("div");stats.className="supplier-stats";
    for(const [label,value,sub] of [
      ["Total Orders",data.summary.total,"All purchase orders"],
      ["Pending Orders",data.summary.pending,"Waiting for your action"],
      ["In Transit",data.summary.inTransit,"Dispatched, not yet delivered"],
      ["Delivered",data.summary.delivered,"Marked as delivered"]
    ]){const c=node("article");c.className="supplier-kpi";c.append(node("span",label),node("h3",value),node("small",sub));stats.append(c);}
    content.append(stats);
    const layout=node("div");layout.className="supplier-dashboard-layout";content.append(layout);
    const recent=node("section");recent.className="supplier-dashboard-card supplier-recent";layout.append(recent);
    const recentHead=node("div");recentHead.className="supplier-section-head";
    const heading=node("div");heading.append(node("h3","Recent Purchase Orders"),node("p","Latest 5 orders assigned to you"));recentHead.append(heading);
    const viewAll=node("button","View all");viewAll.className="secondary-btn";viewAll.addEventListener("click",()=>show("Purchase Orders"));recentHead.append(viewAll);recent.append(recentHead);
    if(!data.recent.length)recent.append(node("p","No purchase orders yet"));
    else{
      const table=node("table");table.className="supplier-recent-table";
      const thead=node("thead"),tr=node("tr");
      for(const h of ["PO NUMBER","ITEMS","EXPECTED","STATUS"])tr.append(node("th",h));
      thead.append(tr);table.append(thead);
      const tbody=node("tbody");
      for(const o of data.recent){
        const row=node("tr");
        row.append(node("td",o.purchaseOrderNumber||String(o._id).slice(-8).toUpperCase()));
        row.append(node("td",String(o.items?.length||1)+" medicine"+((o.items?.length||1)===1?"":"s")));
        row.append(node("td",fmt(o.expectedDeliveryDate||o.estimatedDeliveryDate)));
        const td=node("td"),badge=node("span",o.status);badge.className="supplier-status-badge status-"+o.status.toLowerCase().replace(/[^a-z]+/g,"-");td.append(badge);row.append(td);tbody.append(row);
      }
      table.append(tbody);const wrap=node("div");wrap.className="supplier-table-wrap";wrap.append(table);recent.append(wrap);
    }
    const right=node("div");right.className="supplier-dashboard-right";layout.append(right);
    const quick=node("section");quick.className="supplier-dashboard-card";quick.append(node("h3","Quick Actions"));
    const quickGrid=node("div");quickGrid.className="supplier-quick-grid";
    for(const [label,subtitle,target] of [["Purchase Orders","View and accept","Purchase Orders"],["Delivery Tracking","Update dispatch","Delivery Tracking"],["Order History","Past orders","Order History"],["Company Profile","Contact details","Company Profile"]]){
      const b=node("button");b.type="button";b.append(node("strong",label),node("small",subtitle));b.addEventListener("click",()=>show(target));quickGrid.append(b);
    }
    quick.append(quickGrid);right.append(quick);
    const noticeCard=node("section");noticeCard.className="supplier-dashboard-card";const noticeHead=node("div");noticeHead.className="supplier-section-head";noticeHead.append(node("h3","Notifications"));
    const unread=notifications.notifications.filter(n=>!n.read);if(unread.length){const count=node("span",unread.length);count.className="supplier-notification-count";noticeHead.append(count);}
    noticeCard.append(noticeHead);
    if(!notifications.notifications.length)noticeCard.append(node("p","No notifications yet"));
    else for(const n of notifications.notifications.slice(0,3)){const b=node("button");b.type="button";b.className="supplier-notice-row";b.append(node("strong",n.message),node("small",fmt(n.createdAt)));b.addEventListener("click",()=>show("Notifications"));noticeCard.append(b);}
    right.append(noticeCard);
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
