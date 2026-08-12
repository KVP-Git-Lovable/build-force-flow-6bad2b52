-- Update company profile for SBEE Cables with logo
-- Logo referenced from public assets folder (/assets/sbee_logo.svg)

DELETE FROM public.company_profile;

INSERT INTO public.company_profile (company_name, address, logo_url)
VALUES (
  'SBEE CABLES INDIA LTD',
  'SBEE Cables India Limited',
  '/assets/sbee_logo.svg'
);

SELECT id, company_name, logo_url FROM public.company_profile LIMIT 1;
