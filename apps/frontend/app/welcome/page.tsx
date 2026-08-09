'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, PublicUserProfile } from '../../lib/api-client';

const cities = [['حلب',24,22],['الحسكة',72,18],['الرقة',57,32],['إدلب',18,34],['اللاذقية',7,45],['حماة',29,47],['طرطوس',9,55],['حمص',39,58],['دير الزور',69,52],['دمشق',43,74],['ريف دمشق',51,69],['القنيطرة',31,79],['درعا',39,87],['السويداء',53,85]];

export default function WelcomePage(){
 const router=useRouter(); const [user,setUser]=useState<PublicUserProfile|null>();
 useEffect(()=>{if(sessionStorage.getItem('khedmah.onboarding.complete')==='true'){router.replace('/');return}void api.auth.session().then(({user:u})=>setUser(u)).catch(()=>router.replace('/auth/login'))},[router]);
 function completeOnboarding(){sessionStorage.setItem('khedmah.onboarding.complete','true');router.push('/')}
 if(!user)return <main id="foundation-content" className="welcome-loading" aria-busy="true">جاري تجهيز تجربتك...</main>;
 return <main id="foundation-content" className="map-welcome"><section className="map-phone">
   <div className="syria-map-welcome" aria-label="شبكة خدمة ديجتل في المحافظات السورية"><svg viewBox="0 0 100 105" role="img"><path d="M9 25 28 13l18 5 10-9 32 12-7 17 9 15-14 12-5 23-22-1-12 12-18-11 2-15L8 78l8-15L4 48Z"/></svg>{cities.map(([name,x,y])=><span key={name as string} style={{left:`${x}%`,top:`${y}%`}}>{name}</span>)}</div>
   <div className="map-brand"><p>مرحباً بك في خدمة ديجتل، {user.profile.displayName}</p><h1>أنا مع<br/><strong>خدمة</strong></h1><small>أصبحت ضمن شبكة سوريا. لن ننشر اسمك أو موقعك دون موافقتك.</small></div>
   <button type="button" className="map-continue" onClick={completeOnboarding}>متابعة إلى الرئيسية</button>
 </section></main>
}
