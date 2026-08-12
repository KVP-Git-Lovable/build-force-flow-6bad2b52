-- Update company profile for SBEE Cables
-- Delete existing profile (if any) and insert SBEE profile with logo

DELETE FROM public.company_profile;

INSERT INTO public.company_profile (company_name, address, logo_url)
VALUES (
  'SBEE CABLES INDIA LTD',
  'SBEE Cables India Limited',
  'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTIwIiBoZWlnaHQ9IjEyMCIgdmlld0JveD0iMCAwIDEyMCAxMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHNzdHlsZT5jaXJjbGUgeyBmaWxsOiAjREMyNjI2OyBzdHJva2U6ICM5OTFCMUI7IHN0cm9rZS13aWR0aDogMjsgfSB0ZXh0IHsgZm9udC1mYW1pbHk6IEFyaWFsLCBzYW5zLXNlcmlmOyBmb250LXNpemU6IDcycHg7IGZvbnQtd2VpZ2h0OiBib2xkOyBmaWxsOiB3aGl0ZTsgdGV4dC1hbmNob3I6IG1pZGRsZTsgZG9taW5hbnQtYmFzZWxpbmU6IG1pZGRsZTsgfTwvc3R5bGU+PGNpcmNsZSBjeD0iNjAiIGN5PSI2MCIgcj0iNTgiLz48dGV4dCB4PSI2MCIgeT0iODUiPlM8L3RleHQ+PC9zdmc+'
);

-- Verify the update
SELECT id, company_name, logo_url FROM public.company_profile ORDER BY updated_at DESC LIMIT 1;
