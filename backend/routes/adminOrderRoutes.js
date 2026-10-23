"use strict";
const express=require("express"),mongoose=require("mongoose");
const Order=require("../models/RestockRequest"),Medicine=require("../models/Medicine"),Purchase=require("../models/Purchase");
const Audit=require("../models/AuditLog"),Notice=require("../models/AdminNotification");
const {protect,authorize}=require("../middleware/authMiddleware");
const router=express.Router();router.use(protect,authorize("admin"));
router.get("/orders",async(req,res)=>{try{const orders=await Order.find().sort({createdAt:-1}).limit(500).populate("supplier","supplierName").lean();res.json({orders});}catch(e){res.status(500).json({message:"Could not load orders."});}});
router.get("/notifications",async(req,res)=>{try{res.json({notifications:await Notice.find().sort({createdAt:-1}).limit(100).lean()});}catch(e){res.status(500).json({message:"Could not load notifications."});}});
router.post("/orders/:id/receive",async(req,res)=>{
 const {quantity,batchNumber,expiryDate}=req.body||{};
 if(!mongoose.isValidObjectId(req.params.id)||!Number.isSafeInteger(quantity)||quantity<1||typeof batchNumber!=="string"||!batchNumber.trim()||batchNumber.length>100||typeof expiryDate!=="string"||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(expiryDate)||Number.isNaN(Date.parse(expiryDate))||new Date(expiryDate).toISOString().slice(0,10)!==expiryDate||expiryDate<new Date().toISOString().slice(0,10))
 return res.status(400).json({message:"Enter valid received quantity, batch and non-expired expiry date."});
 const session=await mongoose.startSession();
 try{
 let result;
 await session.withTransaction(async()=>{
  const order=await Order.findById(req.params.id).session(session);
  if(!order||!["Delivered","Partially Received"].includes(order.status))throw Error("INVALID_ORDER");
  const remaining=order.quantityRequested-(order.receivedQuantity||0);
  if(quantity>remaining)throw Error("OVER_RECEIPT");
  const medicine=await Medicine.findById(order.medicine).session(session);
  if(!medicine||medicine.status!=="active")throw Error("MEDICINE_NOT_FOUND");
  let target=await Medicine.findOne({medicineName:medicine.medicineName,batchNumber:batchNumber.trim()}).session(session);
  if(target&&target.expiryDate.toISOString().slice(0,10)!==expiryDate)throw Error("EXPIRY_MISMATCH");
  if(!target){[target]=await Medicine.create([{...medicine.toObject(),_id:new mongoose.Types.ObjectId(),batchNumber:batchNumber.trim(),expiryDate:new Date(expiryDate),quantity:0,createdAt:undefined,updatedAt:undefined}],{session});}
  const updated=await Medicine.updateOne({_id:target._id,status:"active"},{$inc:{quantity}},{session});
  if(updated.modifiedCount!==1)throw Error("STOCK_FAILED");
  order.receivedQuantity=(order.receivedQuantity||0)+quantity;
  order.receivedBatchNumber=batchNumber.trim();order.receivedExpiryDate=new Date(expiryDate);order.receivedAt=new Date();
  order.status=order.receivedQuantity===order.quantityRequested?"Received":"Partially Received";
  if(order.status==="Received")order.active=false;
  order.history.push({status:order.status,action:"verified receipt: "+quantity+" units",actor:req.user.id});
  await order.save({session});
  await Audit.create([{actor:req.user.id,action:"order.received",targetType:"RestockRequest",targetId:order._id,details:{quantity,batchNumber:batchNumber.trim(),expiryDate}}],{session});
  result=order;
 });
 res.json({message:"Stock received and inventory updated.",order:result});
 }catch(e){const known={INVALID_ORDER:[409,"Order is not awaiting receipt."],OVER_RECEIPT:[400,"Quantity exceeds remaining ordered quantity."],MEDICINE_NOT_FOUND:[404,"Medicine not found or inactive."],EXPIRY_MISMATCH:[409,"Existing batch expiry does not match."],STOCK_FAILED:[409,"Stock update failed."]};const k=known[e.message];if(k)return res.status(k[0]).json({message:k[1]});console.error("Receive order:",e);res.status(500).json({message:"Unable to receive stock. MongoDB replica set required."});}finally{await session.endSession();}
});
module.exports=router;
