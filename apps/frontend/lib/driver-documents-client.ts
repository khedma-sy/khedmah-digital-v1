export type DriverDocumentType='driver_photo'|'identity_card'|'driving_license'|'vehicle_license';
export interface DriverDocument {id:string;documentType:DriverDocumentType;reviewStatus:'pending'|'approved'|'rejected';reviewReason?:string;createdAt:string}
export interface DriverReviewBusiness {businessProfileId:string;name:string;categoryCode:string;cityCode:string;pendingDocuments:number}
export const driverDocumentLabels:Record<DriverDocumentType,string>={driver_photo:'صورة السائق',identity_card:'الهوية الشخصية',driving_license:'رخصة القيادة',vehicle_license:'رخصة المركبة'};
async function request<T>(path:string,init?:RequestInit):Promise<T>{
  const response=await fetch(`/api/v1${path}`,{...init,cache:'no-store',credentials:'include',headers:{'Content-Type':'application/json',...init?.headers}});
  const body=await response.json().catch(()=>({}));if(!response.ok)throw Object.assign(new Error(body.message??'Document request failed'),{statusCode:response.status});return body as T;
}
export const driverDocumentsApi={
  list:(id:string)=>request<{documents:DriverDocument[]}>(`/driver-documents/business/${encodeURIComponent(id)}`),
  queue:()=>request<{businesses:DriverReviewBusiness[]}>('/driver-documents/review-queue'),
  review:(id:string,status:'approved'|'rejected',reason:string)=>request(`/driver-documents/${encodeURIComponent(id)}/review`,{method:'POST',body:JSON.stringify({status,reason})}),
  async upload(businessId:string,assetType:DriverDocumentType,file:File){
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size<=0||file.size>5*1024*1024)throw new Error('اختر صورة JPG أو PNG أو WebP بحجم لا يتجاوز 5 ميغابايت.');
    const content=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onerror=()=>reject(new Error('تعذر قراءة الوثيقة.'));reader.onload=()=>resolve(String(reader.result).split(',')[1]??'');reader.readAsDataURL(file);});
    return request('/media',{method:'POST',body:JSON.stringify({ownerType:'business_profile',ownerId:businessId,visibility:'private',assetType,filename:file.name,mimeType:file.type,sizeBytes:file.size,content,sortOrder:0})});
  }
};
