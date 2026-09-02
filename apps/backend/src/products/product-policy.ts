export const FREE_PRODUCT_LIMIT_PER_USER=3;
export function productLimitPerUser():number{if(process.env.PAID_ADVERTISING_ENABLED!=='true')return FREE_PRODUCT_LIMIT_PER_USER;const configured=Number.parseInt(process.env.PRODUCT_LISTING_LIMIT_PER_USER??'',10);return Number.isSafeInteger(configured)&&configured>0&&configured<=1000?configured:FREE_PRODUCT_LIMIT_PER_USER;}
