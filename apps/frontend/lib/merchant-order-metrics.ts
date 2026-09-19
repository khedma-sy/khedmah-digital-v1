import type {FulfillmentOrder} from './recovered-service-client';

export function merchantOrderMetrics(orders:readonly FulfillmentOrder[],now=new Date()){
  const today=orders.filter(order=>{const date=new Date(order.createdAt);return date.getFullYear()===now.getFullYear()&&date.getMonth()===now.getMonth()&&date.getDate()===now.getDate();});
  const delivered=today.filter(order=>order.status==='delivered');
  const closed=today.filter(order=>['delivered','rejected','cancelled'].includes(order.status));
  const amounts=new Map<string,{currency:string;gross:number;count:number;average:number}>();
  for(const order of delivered){
    const item=amounts.get(order.currency)??{currency:order.currency,gross:0,count:0,average:0};
    item.gross+=order.total??order.subtotal+(order.deliveryFee??0);item.count++;item.average=item.gross/item.count;amounts.set(order.currency,item);
  }
  return {today:today.length,delivered:delivered.length,amounts:[...amounts.values()].sort((a,b)=>a.currency.localeCompare(b.currency)),completion:closed.length?Math.round(delivered.length/closed.length*100):0,open:orders.filter(order=>!['delivered','rejected','cancelled'].includes(order.status)).length};
}
