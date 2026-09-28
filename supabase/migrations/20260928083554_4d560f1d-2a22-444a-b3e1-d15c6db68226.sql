CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_age int;
BEGIN
  BEGIN v_age := NULLIF(NEW.raw_user_meta_data->>'age','')::int; EXCEPTION WHEN others THEN v_age := NULL; END;
  INSERT INTO public.profiles (id, email, full_name, age, gender, phone, created_at, updated_at)
  VALUES (NEW.id, NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
    v_age, NULLIF(NEW.raw_user_meta_data->>'gender',''), NULLIF(NEW.raw_user_meta_data->>'phone',''),
    NOW(), NOW())
  ON CONFLICT (id) DO UPDATE SET
    full_name = COALESCE(NULLIF(public.profiles.full_name,''), EXCLUDED.full_name),
    age = COALESCE(public.profiles.age, EXCLUDED.age),
    gender = COALESCE(public.profiles.gender, EXCLUDED.gender),
    phone = COALESCE(public.profiles.phone, EXCLUDED.phone);
  RETURN NEW;
END;
$function$;

UPDATE public.profiles p SET
  age = COALESCE(p.age, CASE WHEN (u.raw_user_meta_data->>'age') ~ '^\d+$' THEN (u.raw_user_meta_data->>'age')::int END),
  gender = COALESCE(p.gender, NULLIF(u.raw_user_meta_data->>'gender','')),
  phone = COALESCE(p.phone, NULLIF(u.raw_user_meta_data->>'phone','')),
  full_name = COALESCE(NULLIF(p.full_name,''), u.raw_user_meta_data->>'full_name')
FROM auth.users u WHERE u.id = p.id;