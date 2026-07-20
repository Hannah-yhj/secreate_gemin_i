import crypto from "crypto";
import { supabase } from "../lib/storage.js";

export default async function handler(req, res) {

    if(req.method !== "POST"){
        return res.status(405).end();
    }

    try{

        const file = req.body.file;

        if(!file){
            return res.status(400).json({
                error:"이미지가 없습니다."
            });
        }

    }catch(err){

        console.error(err);

        res.status(500).json({
            error:err.message
        });

    }

}

const hash = crypto
    .createHash("sha256")
    .update(file)
    .digest("hex");

const fileName = `${hash}.jpg`;

const { error } = await supabase.storage
    .from("coupon-images")
    .upload(fileName,file,{
        upsert:false
    });

if(error){

    return res.status(500).json({
        error:error.message
    });

}

const { data } = await supabase
.storage
.from("coupon-images")
.createSignedUrl(fileName,60*60*24*365);

return res.json({

    success:true,

    image_url:data.signedUrl,

    image_hash:hash

});