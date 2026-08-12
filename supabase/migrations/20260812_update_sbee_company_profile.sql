-- Update company profile for SBEE Cables with logo
-- SVG: Red circle (DC2626) with white "S" text, base64 encoded for data URI

DELETE FROM public.company_profile;

INSERT INTO public.company_profile (company_name, address, logo_url)
VALUES (
  'SBEE CABLES INDIA LTD',
  'SBEE Cables India Limited',
  'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTIwIiBoZWlnaHQ9IjEyMCIgdmlld0JveD0iMCAwIDEyMCAxMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iNjAiIGN5PSI2MCIgcj0iNTgiIGZpbGw9IiNEQzI2MjYiIHN0cm9rZT0iIzk5MUIxQiIgc3Ryb2tlLXdpZHRoPSIyIi8+PHRleHQgeD0iNjAiIHk9Ijg1IiBmb250LWZhbWlseT0iQXJpYWwsIHNhbnMtc2VyaWYiIGZvbnQtc2l6ZT0iNzIiIGZvbnQtd2VpZ2h0PSJib2xkIiBmaWxsPSJ3aGl0ZSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZG9taW5hbnQtYmFzZWxpbmU9Im1pZGRsZSI+UzwvdGV4dD48L3N2Zz4='
);

SELECT id, company_name, logo_url FROM public.company_profile LIMIT 1;
