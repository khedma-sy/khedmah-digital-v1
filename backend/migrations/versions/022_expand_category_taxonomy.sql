-- Expand the flat Category authority into an Arabic-first, searchable hierarchy.
-- Keep the exact pre-022 state of every existing category so the governed
-- rollback can restore rows changed by the canonical upserts/deactivation.
CREATE TABLE category_taxonomy_022_before_image (
  code TEXT PRIMARY KEY,
  name_ar TEXT NOT NULL,
  name_en TEXT,
  status TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

INSERT INTO category_taxonomy_022_before_image
  (code, name_ar, name_en, status, sort_order, created_at, updated_at)
SELECT code, name_ar, name_en, status, sort_order, created_at, updated_at
FROM categories;

ALTER TABLE categories
  ADD COLUMN parent_code TEXT,
  ADD COLUMN visual_key TEXT NOT NULL DEFAULT 'services',
  ADD COLUMN search_aliases_ar TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN search_aliases_en TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN is_featured BOOLEAN NOT NULL DEFAULT FALSE,
  ADD CONSTRAINT categories_parent_code_fk
    FOREIGN KEY (parent_code) REFERENCES categories(code) ON UPDATE CASCADE ON DELETE RESTRICT,
  ADD CONSTRAINT categories_parent_not_self_check
    CHECK (parent_code IS NULL OR parent_code <> code),
  ADD CONSTRAINT categories_visual_key_format_check
    CHECK (visual_key ~ '^[a-z][a-z0-9_]{1,39}$');

CREATE INDEX categories_parent_public_order_idx
  ON categories(parent_code, status, sort_order, code);

-- Root categories shown in primary discovery.
INSERT INTO categories
  (code, name_ar, name_en, parent_code, visual_key, search_aliases_ar, search_aliases_en, is_featured, status, sort_order)
VALUES
  ('home_maintenance', 'الخدمات المنزلية والصيانة', 'Home services & maintenance', NULL, 'home', ARRAY['صيانة','منزل','تصليح'], ARRAY['maintenance','home services','repair'], TRUE, 'active', 100),
  ('food_hospitality', 'الطعام والضيافة', 'Food & hospitality', NULL, 'food', ARRAY['طعام','مطاعم','غذائيات'], ARRAY['food','restaurant','hospitality'], TRUE, 'active', 200),
  ('health_medical', 'الصحة والطب', 'Health & medical', NULL, 'health', ARRAY['صحة','طب','عيادة'], ARRAY['health','medical','clinic'], TRUE, 'active', 300),
  ('education_training', 'التعليم والتدريب', 'Education & training', NULL, 'education', ARRAY['تعليم','دروس','تدريب'], ARRAY['education','training','lessons'], TRUE, 'active', 400),
  ('professional_services', 'الخدمات المهنية', 'Professional services', NULL, 'professional', ARRAY['مهني','استشارات','محاسبة'], ARRAY['professional','consulting','business services'], TRUE, 'active', 500),
  ('beauty_personal_care', 'الجمال والعناية الشخصية', 'Beauty & personal care', NULL, 'beauty', ARRAY['جمال','عناية','صالون'], ARRAY['beauty','personal care','salon'], TRUE, 'active', 600),
  ('retail_shopping', 'المتاجر والتسوق', 'Retail & shopping', NULL, 'shopping', ARRAY['متجر','محل','تسوق'], ARRAY['retail','shop','shopping'], TRUE, 'active', 700),
  ('automotive', 'السيارات وخدماتها', 'Automotive', NULL, 'automotive', ARRAY['سيارات','مركبات','ميكانيك'], ARRAY['cars','automotive','vehicle'], TRUE, 'active', 800),
  ('transport_logistics', 'النقل والتوصيل', 'Transport & logistics', NULL, 'transport', ARRAY['نقل','تكسي','توصيل'], ARRAY['transport','taxi','delivery'], TRUE, 'active', 900),
  ('technology_digital', 'التقنية والخدمات الرقمية', 'Technology & digital', NULL, 'technology', ARRAY['تقنية','برمجة','رقمي'], ARRAY['technology','software','digital'], TRUE, 'active', 1000),
  ('construction_real_estate', 'البناء والعقارات', 'Construction & real estate', NULL, 'construction', ARRAY['بناء','عقار','مقاولات'], ARRAY['construction','real estate','contractor'], TRUE, 'active', 1100),
  ('events_occasions', 'المناسبات والفعاليات', 'Events & occasions', NULL, 'events', ARRAY['مناسبات','أفراح','فعاليات'], ARRAY['events','wedding','occasions'], TRUE, 'active', 1200),
  ('agriculture_livestock', 'الزراعة والثروة الحيوانية', 'Agriculture & livestock', NULL, 'agriculture', ARRAY['زراعة','مواشي','بيطرة'], ARRAY['agriculture','livestock','farming'], TRUE, 'active', 1300),
  ('industrial_supply', 'الصناعة والتوريد', 'Industry & supply', NULL, 'industry', ARRAY['صناعة','مصنع','توريد'], ARRAY['industry','factory','supply'], TRUE, 'active', 1400),
  ('travel_tourism', 'السفر والسياحة', 'Travel & tourism', NULL, 'travel', ARRAY['سفر','سياحة','فندق'], ARRAY['travel','tourism','hotel'], TRUE, 'active', 1500)
ON CONFLICT (code) DO UPDATE SET
  name_ar = EXCLUDED.name_ar,
  name_en = EXCLUDED.name_en,
  parent_code = EXCLUDED.parent_code,
  visual_key = EXCLUDED.visual_key,
  search_aliases_ar = EXCLUDED.search_aliases_ar,
  search_aliases_en = EXCLUDED.search_aliases_en,
  is_featured = EXCLUDED.is_featured,
  status = EXCLUDED.status,
  sort_order = EXCLUDED.sort_order,
  updated_at = NOW();

-- Preserve referenced legacy rows, but keep the public/owner taxonomy canonical.
-- All pre-022 rows start with parent_code = NULL; canonical roots above are the
-- only parentless rows that remain active after this migration.
UPDATE categories
SET status = 'inactive', is_featured = FALSE, updated_at = NOW()
WHERE parent_code IS NULL
  AND code NOT IN (
    'home_maintenance', 'food_hospitality', 'health_medical', 'education_training',
    'professional_services', 'beauty_personal_care', 'retail_shopping', 'automotive',
    'transport_logistics', 'technology_digital', 'construction_real_estate',
    'events_occasions', 'agriculture_livestock', 'industrial_supply', 'travel_tourism'
  )
  AND (status <> 'inactive' OR is_featured);

-- Leaf categories selectable by activity owners and searchable by users.
INSERT INTO categories
  (code, name_ar, name_en, parent_code, visual_key, search_aliases_ar, search_aliases_en, is_featured, status, sort_order)
VALUES
  ('electrician', 'كهربائي', 'Electrician', 'home_maintenance', 'home', ARRAY['كهرباء','تمديدات كهربائية'], ARRAY['electrician','electrical'], FALSE, 'active', 101),
  ('plumber', 'سباك', 'Plumber', 'home_maintenance', 'home', ARRAY['سباكة','تمديدات صحية'], ARRAY['plumber','plumbing'], FALSE, 'active', 102),
  ('carpenter', 'نجار', 'Carpenter', 'home_maintenance', 'home', ARRAY['نجارة','أثاث خشبي'], ARRAY['carpenter','carpentry'], FALSE, 'active', 103),
  ('painter', 'دهان وديكور', 'Painter & decorator', 'home_maintenance', 'home', ARRAY['دهان','طلاء','ديكور'], ARRAY['painter','painting','decor'], FALSE, 'active', 104),
  ('air_conditioning', 'تكييف وتبريد', 'Air conditioning & refrigeration', 'home_maintenance', 'home', ARRAY['مكيف','تصليح مكيف','تبريد'], ARRAY['air conditioning','ac repair','refrigeration'], FALSE, 'active', 105),
  ('appliance_repair', 'صيانة الأجهزة المنزلية', 'Appliance repair', 'home_maintenance', 'home', ARRAY['غسالة','براد','فرن','تصليح أجهزة'], ARRAY['appliance repair','washer','refrigerator'], FALSE, 'active', 106),
  ('cleaning_services', 'خدمات التنظيف', 'Cleaning services', 'home_maintenance', 'home', ARRAY['تنظيف منازل','تعقيم'], ARRAY['cleaning','home cleaning'], FALSE, 'active', 107),
  ('locksmith', 'أقفال ومفاتيح', 'Locksmith', 'home_maintenance', 'home', ARRAY['مفاتيح','قفل'], ARRAY['locksmith','keys'], FALSE, 'active', 108),
  ('solar_energy', 'طاقة شمسية', 'Solar energy', 'home_maintenance', 'home', ARRAY['ألواح شمسية','بطاريات','انفرتر'], ARRAY['solar','solar panels','inverter'], FALSE, 'active', 109),
  ('kitchen_installation', 'مطابخ وخزائن', 'Kitchens & cabinets', 'home_maintenance', 'home', ARRAY['مطابخ','خزائن مطبخ','تركيب مطبخ'], ARRAY['kitchen','cabinets','kitchen installation'], FALSE, 'active', 110),
  ('upholstery', 'تنجيد ومفروشات', 'Upholstery', 'home_maintenance', 'home', ARRAY['منجد','تنجيد كنب','تنجيد'], ARRAY['upholstery','furniture repair'], FALSE, 'active', 111),
  ('gas_appliance_repair', 'صيانة الغاز والأفران', 'Gas appliance repair', 'home_maintenance', 'home', ARRAY['تصليح غاز','صيانة فرن','غازات'], ARRAY['gas appliance repair','oven repair'], FALSE, 'active', 112),

  ('restaurant', 'مطاعم', 'Restaurants', 'food_hospitality', 'food', ARRAY['مطعم','وجبات','أكل'], ARRAY['restaurant','meals','food'], FALSE, 'active', 201),
  ('cafe', 'مقاهٍ', 'Cafes', 'food_hospitality', 'food', ARRAY['مقهى','قهوة'], ARRAY['cafe','coffee'], FALSE, 'active', 202),
  ('bakery', 'مخابز وأفران', 'Bakeries', 'food_hospitality', 'food', ARRAY['خبز','فرن','معجنات'], ARRAY['bakery','bread','pastry'], FALSE, 'active', 203),
  ('sweets', 'حلويات', 'Sweets', 'food_hospitality', 'food', ARRAY['حلويات شرقية','كيك'], ARRAY['sweets','cake','dessert'], FALSE, 'active', 204),
  ('butcher', 'محلات اللحوم', 'Butchers', 'food_hospitality', 'food', ARRAY['لحوم','قصاب','ملحمة'], ARRAY['butcher','meat shop'], FALSE, 'active', 205),
  ('grocery', 'مواد غذائية وبقالة', 'Groceries', 'food_hospitality', 'food', ARRAY['مواد غذائية','بقالية','سوبر ماركت'], ARRAY['grocery','food store','supermarket'], FALSE, 'active', 206),
  ('fruits_vegetables', 'خضار وفواكه', 'Fruit & vegetables', 'food_hospitality', 'food', ARRAY['خضرة','فواكه'], ARRAY['fruit','vegetables'], FALSE, 'active', 207),
  ('catering', 'تموين وضيافة', 'Catering', 'food_hospitality', 'food', ARRAY['طبخ مناسبات','بوفيه'], ARRAY['catering','buffet'], FALSE, 'active', 208),
  ('fish_poultry_shop', 'أسماك ودواجن', 'Fish & poultry shops', 'food_hospitality', 'food', ARRAY['سمك','أسماك','فروج','دجاج','دواجن'], ARRAY['fish shop','poultry shop','chicken'], FALSE, 'active', 209),
  ('juice_icecream', 'عصائر وبوظة', 'Juice & ice cream', 'food_hospitality', 'food', ARRAY['عصير','بوظة','آيس كريم'], ARRAY['juice','ice cream'], FALSE, 'active', 210),

  ('doctor', 'أطباء', 'Doctors', 'health_medical', 'health', ARRAY['طبيب','دكتور'], ARRAY['doctor','physician'], FALSE, 'active', 301),
  ('dentist', 'طب الأسنان', 'Dentists', 'health_medical', 'health', ARRAY['طبيب أسنان','أسنان'], ARRAY['dentist','dental'], FALSE, 'active', 302),
  ('pharmacy', 'صيدليات', 'Pharmacies', 'health_medical', 'health', ARRAY['صيدلية','دواء'], ARRAY['pharmacy','medicine'], FALSE, 'active', 303),
  ('clinic', 'عيادات ومراكز طبية', 'Clinics & medical centers', 'health_medical', 'health', ARRAY['عيادة','مركز طبي'], ARRAY['clinic','medical center'], FALSE, 'active', 304),
  ('laboratory', 'مخابر وتحاليل', 'Laboratories', 'health_medical', 'health', ARRAY['مخبر','تحاليل طبية'], ARRAY['laboratory','medical tests'], FALSE, 'active', 305),
  ('physiotherapy', 'علاج فيزيائي', 'Physiotherapy', 'health_medical', 'health', ARRAY['علاج طبيعي','فيزيائي'], ARRAY['physiotherapy','physical therapy'], FALSE, 'active', 306),
  ('nursing_homecare', 'تمريض ورعاية منزلية', 'Nursing & home care', 'health_medical', 'health', ARRAY['ممرض','رعاية مسنين'], ARRAY['nursing','home care'], FALSE, 'active', 307),
  ('veterinary', 'طب بيطري', 'Veterinary', 'health_medical', 'health', ARRAY['بيطري','حيوانات أليفة'], ARRAY['veterinary','vet'], FALSE, 'active', 308),

  ('school', 'مدارس', 'Schools', 'education_training', 'education', ARRAY['مدرسة','تعليم'], ARRAY['school','education'], FALSE, 'active', 401),
  ('nursery', 'حضانة ورياض أطفال', 'Nurseries & kindergarten', 'education_training', 'education', ARRAY['روضة','حضانة'], ARRAY['nursery','kindergarten'], FALSE, 'active', 402),
  ('private_tutor', 'مدرسون ودروس خاصة', 'Private tutors', 'education_training', 'education', ARRAY['مدرس خصوصي','دروس'], ARRAY['tutor','private lessons'], FALSE, 'active', 403),
  ('language_training', 'لغات ومعاهد', 'Language institutes', 'education_training', 'education', ARRAY['لغة','معهد لغات'], ARRAY['language training','language institute'], FALSE, 'active', 404),
  ('vocational_training', 'تدريب مهني', 'Vocational training', 'education_training', 'education', ARRAY['دورات مهنية','تدريب'], ARRAY['vocational training','courses'], FALSE, 'active', 405),

  ('lawyer', 'محامون وخدمات قانونية', 'Lawyers & legal services', 'professional_services', 'professional', ARRAY['محامي','قانون'], ARRAY['lawyer','legal'], FALSE, 'active', 501),
  ('accountant', 'محاسبة وتدقيق', 'Accounting & audit', 'professional_services', 'professional', ARRAY['محاسب','حسابات'], ARRAY['accountant','accounting','audit'], FALSE, 'active', 502),
  ('engineer', 'مهندسون', 'Engineers', 'professional_services', 'professional', ARRAY['مهندس','هندسة'], ARRAY['engineer','engineering'], FALSE, 'active', 503),
  ('architect', 'هندسة معمارية', 'Architecture', 'professional_services', 'professional', ARRAY['مهندس معماري','مخططات'], ARRAY['architect','architecture'], FALSE, 'active', 504),
  ('business_consulting', 'استشارات أعمال', 'Business consulting', 'professional_services', 'professional', ARRAY['مستشار','دراسة جدوى'], ARRAY['business consultant','consulting'], FALSE, 'active', 505),
  ('translation', 'ترجمة', 'Translation', 'professional_services', 'professional', ARRAY['مترجم','ترجمة محلفة'], ARRAY['translation','translator'], FALSE, 'active', 506),
  ('recruitment', 'توظيف وموارد بشرية', 'Recruitment & HR', 'professional_services', 'professional', ARRAY['توظيف','موارد بشرية'], ARRAY['recruitment','human resources'], FALSE, 'active', 507),
  ('office_services', 'خدمات مكتبية', 'Office services', 'professional_services', 'professional', ARRAY['طباعة معاملات','تصوير مستندات'], ARRAY['office services','documents'], FALSE, 'active', 508),

  ('barber', 'حلاقة رجالية', 'Barbers', 'beauty_personal_care', 'beauty', ARRAY['حلاق','حلاقة'], ARRAY['barber','haircut'], FALSE, 'active', 601),
  ('beauty_salon', 'صالونات نسائية', 'Beauty salons', 'beauty_personal_care', 'beauty', ARRAY['كوافير','صالون تجميل'], ARRAY['beauty salon','hair salon'], FALSE, 'active', 602),
  ('cosmetics', 'مستحضرات تجميل', 'Cosmetics', 'beauty_personal_care', 'beauty', ARRAY['مكياج','عناية بالبشرة'], ARRAY['cosmetics','makeup','skincare'], FALSE, 'active', 603),
  ('tailor', 'خياطة وتفصيل', 'Tailoring', 'beauty_personal_care', 'beauty', ARRAY['خياط','تفصيل ملابس'], ARRAY['tailor','tailoring'], FALSE, 'active', 604),
  ('laundry', 'غسيل وكي', 'Laundry', 'beauty_personal_care', 'beauty', ARRAY['مصبغة','دراي كلين'], ARRAY['laundry','dry cleaning'], FALSE, 'active', 605),
  ('fitness', 'نوادٍ رياضية ولياقة', 'Fitness & gyms', 'beauty_personal_care', 'beauty', ARRAY['نادي رياضي','جيم'], ARRAY['fitness','gym'], FALSE, 'active', 606),

  ('clothing_store', 'ألبسة', 'Clothing stores', 'retail_shopping', 'shopping', ARRAY['ملابس','أزياء'], ARRAY['clothing','fashion'], FALSE, 'active', 701),
  ('shoes_store', 'أحذية وحقائب', 'Shoes & bags', 'retail_shopping', 'shopping', ARRAY['أحذية','شنط'], ARRAY['shoes','bags'], FALSE, 'active', 702),
  ('furniture_store', 'مفروشات وأثاث', 'Furniture stores', 'retail_shopping', 'shopping', ARRAY['أثاث','مفروشات'], ARRAY['furniture','home furnishing'], FALSE, 'active', 703),
  ('electronics_store', 'إلكترونيات وكهربائيات', 'Electronics stores', 'retail_shopping', 'shopping', ARRAY['إلكترونيات','أجهزة كهربائية'], ARRAY['electronics','electrical appliances'], FALSE, 'active', 704),
  ('mobile_shop', 'هواتف واتصالات', 'Mobile phones & telecom', 'retail_shopping', 'shopping', ARRAY['موبايل','جوال','صيانة هاتف'], ARRAY['mobile phone','telecom'], FALSE, 'active', 705),
  ('home_goods', 'أدوات منزلية', 'Home goods', 'retail_shopping', 'shopping', ARRAY['أواني','أدوات بيت'], ARRAY['home goods','housewares'], FALSE, 'active', 706),
  ('gifts_flowers', 'هدايا وزهور', 'Gifts & flowers', 'retail_shopping', 'shopping', ARRAY['هدايا','ورد','زهور'], ARRAY['gifts','flowers'], FALSE, 'active', 707),
  ('books_stationery', 'كتب وقرطاسية', 'Books & stationery', 'retail_shopping', 'shopping', ARRAY['مكتبة','قرطاسية'], ARRAY['books','stationery'], FALSE, 'active', 708),

  ('auto_mechanic', 'ميكانيك سيارات', 'Auto mechanics', 'automotive', 'automotive', ARRAY['ميكانيكي','تصليح سيارة'], ARRAY['mechanic','car repair'], FALSE, 'active', 801),
  ('auto_electrician', 'كهرباء سيارات', 'Auto electrical', 'automotive', 'automotive', ARRAY['كهربائي سيارات','بطارية سيارة'], ARRAY['auto electrician','car electrical'], FALSE, 'active', 802),
  ('tire_service', 'إطارات وبنشر', 'Tires & puncture repair', 'automotive', 'automotive', ARRAY['دواليب','بنشر','إطارات'], ARRAY['tires','puncture repair'], FALSE, 'active', 803),
  ('car_wash', 'غسيل وتلميع سيارات', 'Car wash & detailing', 'automotive', 'automotive', ARRAY['مغسلة سيارات','تلميع'], ARRAY['car wash','detailing'], FALSE, 'active', 804),
  ('auto_parts', 'قطع غيار سيارات', 'Auto parts', 'automotive', 'automotive', ARRAY['قطع سيارات','زيوت'], ARRAY['auto parts','car parts'], FALSE, 'active', 805),
  ('towing', 'سحب وإنقاذ سيارات', 'Towing & roadside assistance', 'automotive', 'automotive', ARRAY['سطحة','ونش','إنقاذ طريق'], ARRAY['towing','roadside assistance'], FALSE, 'active', 806),
  ('car_rental', 'تأجير سيارات', 'Car rental', 'automotive', 'automotive', ARRAY['سيارة للإيجار'], ARRAY['car rental','rent a car'], FALSE, 'active', 807),
  ('car_dealership', 'معارض سيارات', 'Car dealerships', 'automotive', 'automotive', ARRAY['معرض سيارات','بيع سيارات','شراء سيارة'], ARRAY['car dealership','car sales'], FALSE, 'active', 808),

  ('taxi', 'تكسي', 'Taxi', 'transport_logistics', 'transport', ARRAY['تاكسي','سيارة أجرة','مشوار'], ARRAY['taxi','cab','ride'], FALSE, 'active', 901),
  ('delivery_courier', 'مندوب توصيل', 'Delivery & courier', 'transport_logistics', 'transport', ARRAY['دليفري','توصيل طلبات','مندوب','بيك أب توصيل'], ARRAY['delivery','courier','driver','pickup delivery'], FALSE, 'active', 902),
  ('freight_transport', 'نقل وشحن', 'Freight transport', 'transport_logistics', 'transport', ARRAY['شحن','نقل بضائع'], ARRAY['freight','cargo','shipping'], FALSE, 'active', 903),
  ('moving_services', 'نقل أثاث', 'Moving services', 'transport_logistics', 'transport', ARRAY['نقل عفش','نقل منزل'], ARRAY['moving','furniture transport'], FALSE, 'active', 904),
  ('passenger_transport', 'نقل ركاب', 'Passenger transport', 'transport_logistics', 'transport', ARRAY['سرفيس','باص','نقل سياحي'], ARRAY['passenger transport','bus'], FALSE, 'active', 905),

  ('software_development', 'برمجة وتطوير', 'Software development', 'technology_digital', 'technology', ARRAY['مبرمج','تطبيقات','مواقع'], ARRAY['software','developer','apps'], FALSE, 'active', 1001),
  ('it_support', 'دعم فني وشبكات', 'IT support & networks', 'technology_digital', 'technology', ARRAY['كمبيوتر','شبكات','صيانة حاسوب'], ARRAY['it support','networks','computer repair'], FALSE, 'active', 1002),
  ('web_design', 'تصميم مواقع وتجربة مستخدم', 'Web & UX design', 'technology_digital', 'technology', ARRAY['تصميم موقع','واجهات'], ARRAY['web design','ux','ui'], FALSE, 'active', 1003),
  ('digital_marketing', 'تسويق رقمي', 'Digital marketing', 'technology_digital', 'technology', ARRAY['إعلانات','سوشال ميديا','تسويق'], ARRAY['digital marketing','social media','ads'], FALSE, 'active', 1004),
  ('photography_video', 'تصوير وفيديو', 'Photography & video', 'technology_digital', 'technology', ARRAY['مصور','مونتاج'], ARRAY['photography','video','editing'], FALSE, 'active', 1005),
  ('printing_design', 'طباعة وتصميم', 'Printing & graphic design', 'technology_digital', 'technology', ARRAY['مطبعة','غرافيك'], ARRAY['printing','graphic design'], FALSE, 'active', 1006),

  ('contractor', 'مقاولات', 'Contractors', 'construction_real_estate', 'construction', ARRAY['متعهد','مقاول'], ARRAY['contractor','construction'], FALSE, 'active', 1101),
  ('building_materials', 'مواد بناء', 'Building materials', 'construction_real_estate', 'construction', ARRAY['إسمنت','حديد بناء','بحص'], ARRAY['building materials','cement'], FALSE, 'active', 1102),
  ('real_estate_agent', 'مكاتب عقارية', 'Real estate agencies', 'construction_real_estate', 'construction', ARRAY['عقارات','بيع منزل','إيجار'], ARRAY['real estate','property'], FALSE, 'active', 1103),
  ('aluminum_glass', 'ألمنيوم وزجاج', 'Aluminum & glass', 'construction_real_estate', 'construction', ARRAY['ألمنيوم','زجاج','واجهات'], ARRAY['aluminum','glass'], FALSE, 'active', 1104),
  ('blacksmith', 'حدادة', 'Blacksmiths', 'construction_real_estate', 'construction', ARRAY['حداد','حديد'], ARRAY['blacksmith','metalwork'], FALSE, 'active', 1105),
  ('tiling_stone', 'بلاط ورخام', 'Tiling & stone', 'construction_real_estate', 'construction', ARRAY['بلاط','رخام','سيراميك'], ARRAY['tiling','marble','ceramic'], FALSE, 'active', 1106),

  ('event_planning', 'تنظيم مناسبات', 'Event planning', 'events_occasions', 'events', ARRAY['منظم حفلات','تنسيق مناسبة'], ARRAY['event planning','party planner'], FALSE, 'active', 1201),
  ('wedding_hall', 'صالات أفراح', 'Wedding halls', 'events_occasions', 'events', ARRAY['صالة عرس','قاعة'], ARRAY['wedding hall','venue'], FALSE, 'active', 1202),
  ('event_decor', 'ديكور وتنسيق مناسبات', 'Event decor', 'events_occasions', 'events', ARRAY['كوشة','زينة حفلات'], ARRAY['event decor','wedding decor'], FALSE, 'active', 1203),
  ('sound_lighting', 'صوت وإضاءة', 'Sound & lighting', 'events_occasions', 'events', ARRAY['دي جي','إنارة حفلات'], ARRAY['sound','lighting','dj'], FALSE, 'active', 1204),

  ('farming_services', 'خدمات زراعية', 'Farming services', 'agriculture_livestock', 'agriculture', ARRAY['مزارع','فلاحة'], ARRAY['farming','agriculture services'], FALSE, 'active', 1301),
  ('agricultural_supplies', 'مستلزمات زراعية', 'Agricultural supplies', 'agriculture_livestock', 'agriculture', ARRAY['بذور','سماد','مبيدات'], ARRAY['seeds','fertilizer','agricultural supplies'], FALSE, 'active', 1302),
  ('livestock_poultry', 'مواشي ودواجن', 'Livestock & poultry', 'agriculture_livestock', 'agriculture', ARRAY['أبقار','أغنام','دجاج'], ARRAY['livestock','poultry'], FALSE, 'active', 1303),
  ('irrigation', 'ري ومضخات مياه', 'Irrigation & pumps', 'agriculture_livestock', 'agriculture', ARRAY['شبكات ري','مضخة'], ARRAY['irrigation','water pumps'], FALSE, 'active', 1304),

  ('factory', 'مصانع ومنتجون', 'Factories & manufacturers', 'industrial_supply', 'industry', ARRAY['مصنع','معمل','منتج'], ARRAY['factory','manufacturer'], FALSE, 'active', 1401),
  ('wholesale_supplier', 'موردون وجملة', 'Wholesale suppliers', 'industrial_supply', 'industry', ARRAY['مورد','تاجر جملة','توزيع'], ARRAY['supplier','wholesale','distribution'], FALSE, 'active', 1402),
  ('tools_equipment', 'معدات وأدوات', 'Tools & equipment', 'industrial_supply', 'industry', ARRAY['معدات صناعية','عدد'], ARRAY['tools','equipment'], FALSE, 'active', 1403),
  ('packaging', 'تعبئة وتغليف', 'Packaging', 'industrial_supply', 'industry', ARRAY['عبوات','كراتين','تغليف'], ARRAY['packaging','boxes'], FALSE, 'active', 1404),
  ('international_trade', 'تجارة دولية واستيراد وتصدير', 'International trade', 'industrial_supply', 'industry', ARRAY['تاجر دولي','استيراد','تصدير'], ARRAY['international trade','import','export'], FALSE, 'active', 1405),

  ('hotel', 'فنادق وإقامة', 'Hotels & accommodation', 'travel_tourism', 'travel', ARRAY['فندق','نزل','شاليه'], ARRAY['hotel','accommodation'], FALSE, 'active', 1501),
  ('travel_agency', 'مكاتب سياحة وسفر', 'Travel agencies', 'travel_tourism', 'travel', ARRAY['حجوزات سفر','سياحة'], ARRAY['travel agency','tourism'], FALSE, 'active', 1502),
  ('tour_guide', 'دليل سياحي', 'Tour guides', 'travel_tourism', 'travel', ARRAY['مرشد سياحي','رحلات'], ARRAY['tour guide','tours'], FALSE, 'active', 1503),
  ('farm_chalet_rental', 'مزارع وشاليهات للإيجار', 'Farms & chalets for rent', 'travel_tourism', 'travel', ARRAY['مزرعة للإيجار','شاليه للإيجار','استراحة'], ARRAY['farm rental','chalet rental','holiday rental'], FALSE, 'active', 1504)
ON CONFLICT (code) DO UPDATE SET
  name_ar = EXCLUDED.name_ar,
  name_en = EXCLUDED.name_en,
  parent_code = EXCLUDED.parent_code,
  visual_key = EXCLUDED.visual_key,
  search_aliases_ar = EXCLUDED.search_aliases_ar,
  search_aliases_en = EXCLUDED.search_aliases_en,
  is_featured = EXCLUDED.is_featured,
  status = EXCLUDED.status,
  sort_order = EXCLUDED.sort_order,
  updated_at = NOW();
