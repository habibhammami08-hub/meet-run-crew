CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_age int;
BEGIN
  BEGIN v_age := NULLIF(NEW.raw_user_meta_data->>'age','')::int; EXCEPTION WHEN others THEN v_age := NULL; END;
  INSERT INTO public.profiles (id, email, full_name, age, gender, phone, city, created_at, updated_at)
  VALUES (NEW.id, NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
    v_age, NULLIF(NEW.raw_user_meta_data->>'gender',''), NULLIF(NEW.raw_user_meta_data->>'phone',''),
    NULLIF(NEW.raw_user_meta_data->>'city',''),
    NOW(), NOW())
  ON CONFLICT (id) DO UPDATE SET
    full_name = COALESCE(NULLIF(public.profiles.full_name,''), EXCLUDED.full_name),
    age = COALESCE(public.profiles.age, EXCLUDED.age),
    gender = COALESCE(public.profiles.gender, EXCLUDED.gender),
    phone = COALESCE(public.profiles.phone, EXCLUDED.phone),
    city = COALESCE(public.profiles.city, EXCLUDED.city);
  RETURN NEW;
END;
$function$;