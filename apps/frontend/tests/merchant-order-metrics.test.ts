import assert from 'node:assert/strict';
import test from 'node:test';
import {merchantOrderMetrics} from '../lib/merchant-order-metrics';
import type {FulfillmentOrder} from '../lib/recovered-service-client';

test('restaurant metrics keep currencies separate and count only delivered orders in the displayed day',()=>{
  const now=new Date(2026,8,15,12);
  const order=(currency:string,total:number,status='delivered',createdAt=now.toISOString())=>({currency,total,status,createdAt}) as FulfillmentOrder;
  const result=merchantOrderMetrics([order('SYP',1200),order('SYP',1800),order('USD',10),order('USD',50,'cancelled'),order('SYP',9999,'delivered',new Date(2026,8,14,12).toISOString())],now);
  assert.equal(result.today,4);assert.equal(result.delivered,3);assert.equal(result.completion,75);
  assert.deepEqual(result.amounts,[{currency:'SYP',gross:3000,count:2,average:1500},{currency:'USD',gross:10,count:1,average:10}]);
});
