"use strict";
(() => {
 const inactiveMessage="Your account is not active. Please contact the admin";
 const originalFetch=window.fetch.bind(window);
 let ending=false;
 function logoutInactive(){
   if(ending)return;
   ending=true;
   if(typeof currentUser!=="undefined"&&currentUser?.role==="supplier"){
     if(typeof authToken!=="undefined")authToken="";
     if(typeof currentUser!=="undefined")currentUser=null;
     document.body.classList.remove("is-authenticated");
     const sections=document.getElementById("appSections");
     if(sections)sections.hidden=true;
     const login=document.getElementById("loginSection");
     if(login)login.hidden=false;
     const message=document.getElementById("loginMessage");
     if(message)message.textContent=inactiveMessage;
     const portal=document.getElementById("supplierPortalPanel");
     if(portal)portal.hidden=true;
   }
   ending=false;
 }
 window.fetch=async function(input,init){
   const response=await originalFetch(input,init);
   if(response.status===403&&typeof currentUser!=="undefined"&&currentUser?.role==="supplier"){
     const url=typeof input==="string"?input:input?.url||"";
     if(url.includes("/api/")){
       const clone=response.clone();
       clone.json().then(data=>{
         if(data?.code==="SUPPLIER_INACTIVE"||data?.message===inactiveMessage)logoutInactive();
       }).catch(()=>{});
     }
   }
   return response;
 };
 document.addEventListener("visibilitychange",()=>{
   if(document.visibilityState==="visible"&&typeof currentUser!=="undefined"&&currentUser?.role==="supplier"&&typeof authToken!=="undefined"&&authToken)
     originalFetch("/api/auth/me",{headers:{Authorization:"Bearer "+authToken}})
       .then(async r=>{if(r.status===403){const data=await r.json().catch(()=>({}));if(data.code==="SUPPLIER_INACTIVE"||data.message===inactiveMessage)logoutInactive();}})
       .catch(()=>{});
 });
})();
