import assert from 'node:assert/strict';
import test from 'node:test';
import { clientPage, deferred, primitives, readSource } from './helpers/client-page-harness.mjs';
const user={id:'owner',email:'owner@example.test',profile:{displayName:'مالك اختبار',locale:'ar'}};
function fixture(kind='navigation'){
  let pathname='/';const sessions=[],logouts=[],navigations=[];
  const call=list=>{const d=deferred();list.push(d);return d.promise;};
  const api={auth:{session:()=>call(sessions),logout:()=>call(logouts)}};
  const router={push:p=>navigations.push(p),replace:p=>navigations.push(p)};
  const source=kind==='navigation'?readSource('apps/frontend/app/auth-navigation.tsx')+'\nexport default AuthNavigation;':readSource('apps/frontend/app/users/me/page.tsx');
  const page=clientPage(source,kind==='navigation'?{
    'next/link':{default:'Link'},'next/navigation':{useRouter:()=>router,usePathname:()=>pathname},'../lib/api-client':{api},'./components/platform-icon':{PlatformIcon:'PlatformIcon'}
  }:{'../../../lib/api-client':{api},'../../components/ui-primitives':primitives});
  return{page,sessions,logouts,navigations,get authState(){return page.find(n=>n.props?.['data-auth-state'])?.props['data-auth-state'];},navigate(path){pathname=path;page.render();},async resolve(call,value){call.resolve(value);await page.flush();},async reject(call,value){call.reject(value);await page.flush();}};
}
test('a stale route session response cannot restore an account after confirmed logout',async()=>{
  const f=fixture();await f.resolve(f.sessions[0],{user});f.navigate('/users/me');const stale=f.sessions[1];
  f.page.click('تسجيل الخروج');await f.resolve(f.logouts[0],{});assert.equal(f.authState,'guest');
  await f.resolve(stale,{user});assert.equal(f.authState,'guest');
});
test('session network failures remain unknown and recover without claiming guest status',async()=>{
  const f=fixture();await f.reject(f.sessions[0],new Error('offline'));assert.notEqual(f.authState,'guest');f.page.click('إعادة المحاولة');
  await f.resolve(f.sessions[1],{user});assert.equal(f.authState,'authenticated');
});
test('confirmed 401 is guest state; refresh network errors retain the last known account',async()=>{
  const g=fixture();await g.reject(g.sessions[0],Object.assign(new Error('expired'),{statusCode:401}));assert.equal(g.authState,'guest');
  const f=fixture();await f.resolve(f.sessions[0],{user});f.navigate('/users/me');await f.reject(f.sessions[1],new Error('offline'));assert.equal(f.authState,'authenticated');assert.match(f.page.text,/الاتصال|التحقق/);
});
test('logout double invocation makes one request and unmount prevents late navigation',async()=>{
  const f=fixture();await f.resolve(f.sessions[0],{user});const button=f.page.find(n=>n.props?.className==='nav-logout');button.props.onClick();button.props.onClick();f.page.render();assert.equal(f.logouts.length,1);
  f.page.unmount();f.logouts[0].resolve({});await f.page.flush();assert.equal(f.page.writesAfterUnmount,0);assert.deepEqual(f.navigations,[]);
});
test('uncertain logout verifies the session and handles a confirmed 401',async()=>{
  const f=fixture();await f.resolve(f.sessions[0],{user});f.page.click('تسجيل الخروج');await f.reject(f.logouts[0],new Error('lost response'));
  assert.equal(f.sessions.length,2);await f.reject(f.sessions[1],Object.assign(new Error('expired'),{statusCode:401}));assert.equal(f.authState,'guest');
});
test('failed verification after uncertain logout keeps the account and reports uncertainty',async()=>{
  const f=fixture();await f.resolve(f.sessions[0],{user});f.page.click('تسجيل الخروج');await f.reject(f.logouts[0],new Error('offline'));await f.reject(f.sessions[1],new Error('offline'));assert.equal(f.authState,'authenticated');assert.match(f.page.text,/تعذر التحقق/);
});
test('account retry is cancelled on unmount instead of writing into the closed page',async()=>{
  const f=fixture('account');await f.reject(f.sessions[0],new Error('offline'));f.page.click('إعادة المحاولة');f.page.unmount();f.sessions[1].resolve({user});await f.page.flush();assert.equal(f.page.writesAfterUnmount,0);
});
