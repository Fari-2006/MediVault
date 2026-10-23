"use strict";
const mongoose=require("mongoose");
const schema=new mongoose.Schema({supplier:{type:mongoose.Schema.Types.ObjectId,ref:"Supplier",required:true,index:true},order:{type:mongoose.Schema.Types.ObjectId,ref:"RestockRequest"},message:{type:String,required:true},read:{type:Boolean,default:false}}, {timestamps:true});
module.exports=mongoose.model("SupplierNotification",schema);
