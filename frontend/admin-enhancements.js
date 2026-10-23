"use strict";
(() => {
 const $ = id => document.getElementById(id);
 const role = $("registerRole"), companyWrap = $("registerCompanyWrap"), company = $("registerCompany");
 const syncRole = () => { const supplier = role?.value === "supplier"; if (companyWrap) companyWrap.hidden = !supplier; if (company) company.required = supplier; };
 role?.addEventListener("change", syncRole); syncRole();
 // Capture the original submit before the legacy cashier-only handler runs.
 $("registerForm")?.addEventListener("submit", async e => {
   if (role?.value !== "supplier") return;
   e.preventDefault(); e.stopImmediatePropagation();
   const form = e.currentTarget, button = form.querySelector('button[type="submit"]');
   if (!form.reportValidity()) return;
   button.disabled = true;
   try {
     const body = { role: "supplier", companyName: company.value, name: $("registerName").value,
       email: $("registerEmail").value, phone: $("registerPhone").value,
       address: $("registerAddress").value, password: $("registerPassword").value,
       confirmPassword: $("registerConfirm").value };
     const response = await fetch("http://localhost:5000/api/auth/register", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(body) });
     const data = await response.json();
     if (!response.ok) throw new Error(data.message || "Registration failed");
     $("registerMessage").textContent = data.message;
     form.reset(); syncRole();
   } catch (error) { $("registerMessage").textContent = error.message; }
   finally { button.disabled = false; }
 }, true);
 const panels = ["supplierApplicationsPanel","auditHistoryPanel","supplierPortalPanel"];
 const pages = ["supplier-applications","audit-history","supplier-portal"];
 const current = () => typeof currentUser !== "undefined" ? currentUser : null;
 const token = () => typeof authToken !== "undefined" ? authToken : "";
 const get = async path => {
   const response = await fetch("http://localhost:5000/api" + path, { headers: { Authorization: "Bearer " + token() } });
   const data = await response.json();
   if (!response.ok) throw new Error(data.message || "Request failed");
   return data;
 };
 const node = (tag, value) => { const el = document.createElement(tag); el.textContent = String(value ?? ""); return el; };
 const clear = id => { const el = $(id); if (el) el.replaceChildren(); return el; };
 const row = (parent, values) => { const r = document.createElement("div"); r.className="mv-record"; values.forEach(v=>r.append(node("span",v))); parent.append(r); return r; };
 async function load(page) {
   try {
     if (page === "supplier-applications") {
       $("supplierApplicationsMessage").textContent = "Loading applications...";
       const data = await get("/supplier-accounts/applications");
       const root = clear("supplierApplicationsRows");
       for (const item of data.applications) {
         const r = row(root,[item.supplier?.supplierName || item.name,item.email,item.approvalStatus]);
         if (item.approvalStatus === "pending") for (const action of ["approve","reject"]) {
           const b = node("button",action === "approve" ? "Approve" : "Reject"); b.className="secondary-btn";
           b.addEventListener("click", async () => { b.disabled=true; try {
             const response = await fetch("http://localhost:5000/api/supplier-accounts/applications/"+item.id,{method:"PATCH",headers:{"Content-Type":"application/json",Authorization:"Bearer "+token()},body:JSON.stringify({action})});
             const result=await response.json(); if(!response.ok) throw Error(result.message); await load(page);
           } catch(error){$("supplierApplicationsMessage").textContent=error.message;b.disabled=false;} }); r.append(b);
         }
       }
       $("supplierApplicationsMessage").textContent = data.count + " supplier account(s)";
     } else if (page === "audit-history") {
       const data=await get("/admin/audit-logs"); const root=clear("auditHistoryRows");
       for(const log of data.logs) row(root,[new Date(log.createdAt).toLocaleString(),log.actor?.name || "Unknown",log.action,log.targetType]);
       $("auditHistoryMessage").textContent=data.count+" recent event(s)";
     } else if(page==="supplier-portal") {
       const [profile,orders]=await Promise.all([get("/supplier-accounts/me"),get("/supplier-accounts/my-orders")]);
       $("supplierProfileSummary").textContent=profile.supplier.supplierName+" — "+profile.supplier.email;
       const root=clear("supplierOrderRows");
       for(const p of orders.orders) row(root,[p.purchaseNumber,p.medicineName,p.quantity,p.status]);
       $("supplierPortalMessage").textContent=orders.count+" received purchase record(s)";
     }
   } catch(error) { const id=page==="supplier-applications"?"supplierApplicationsMessage":page==="audit-history"?"auditHistoryMessage":"supplierPortalMessage";$(id).textContent=error.message; }
 }
 function nav() {
   const user=current(), active=!!token();
   document.querySelectorAll('[data-page="supplier-applications"],[data-page="audit-history"]').forEach(el=>el.hidden=!(active&&user?.role==="admin"));
   document.querySelectorAll('[data-page="supplier-portal"]').forEach(el=>el.hidden=!(active&&user?.role==="supplier"));
   if(active&&user?.role==="supplier") document.querySelectorAll(".navigation .nav-link").forEach(el=>{if(!pages.includes(el.dataset.page))el.hidden=true;});
 }
 document.querySelectorAll(".navigation .nav-link").forEach(link=>{if(!pages.includes(link.dataset.page))return;
   link.addEventListener("click",e=>{e.preventDefault();const page=link.dataset.page;
     const user=current();if(!token()||(page==="supplier-portal"?user?.role!=="supplier":user?.role!=="admin"))return;
     $("appSections").hidden=false;
     $("appSections").querySelectorAll(":scope > section, :scope > div").forEach(el=>{if(!panels.includes(el.id))el.hidden=true;});
     panels.forEach(id=>$(id).hidden=id!==({ "supplier-applications":"supplierApplicationsPanel","audit-history":"auditHistoryPanel","supplier-portal":"supplierPortalPanel" }[page]));
     document.querySelectorAll(".nav-link").forEach(el=>el.classList.toggle("active",el===link));
     load(page);
   });
 });
 const observer=new MutationObserver(nav);observer.observe(document.body,{attributes:true,attributeFilter:["class"]});nav();
 // Login code changes account state after the body class changes.
 $("loginForm")?.addEventListener("submit",()=>setTimeout(nav,500));
})();
