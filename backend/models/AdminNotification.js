"use strict";
const mongoose=require("mongoose");
const schema=new mongoose.Schema({order:{type:mongoose.Schema.Types.ObjectId,ref:"RestockRequest"},message:{type:String,required:true},read:{type:Boolean,default:false}}, {timestamps:true});
module.exports=mongoose.model("AdminNotification",schema);
