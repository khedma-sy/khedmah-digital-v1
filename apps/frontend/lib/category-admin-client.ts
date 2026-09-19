'use client';

export type AdminCategory={
  code:string;nameAr:string;nameEn?:string;parentCode?:string;visualKey:string;isFeatured:boolean;status:'active'|'inactive';sortOrder:number;
};

async function request<T>(path:string,init?:RequestInit):Promise<T>{
  const response=await fetch(`/api/v1${path}`,{...init,credentials:'include',headers:{'Content-Type':'application/json',...init?.headers}});
  const data=await response.json().catch(()=>({}));
  if(!response.ok){const raw=(data as {message?:string|string[]}).message;const message=Array.isArray(raw)?raw.join('. '):raw||`تعذر إكمال الطلب (${response.status}).`;throw Object.assign(new Error(message),{statusCode:response.status});}
  return data as T;
}

export const categoryAdminApi={
  list:()=>request<{categories:AdminCategory[]}>('/admin/categories'),
  create:(data:Record<string,unknown>)=>request<{category:AdminCategory}>('/admin/categories',{method:'POST',body:JSON.stringify(data)}),
  update:(code:string,data:Record<string,unknown>)=>request<{category:AdminCategory}>(`/admin/categories/${encodeURIComponent(code)}`,{method:'PATCH',body:JSON.stringify(data)})
};
