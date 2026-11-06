# AiTeacher API Test UI

.NET 8 AiTeacher API üçün asılılıqsız Node.js test paneli.

## İşə salma

1. API-ni ayrıca terminalda işə salın:
   ```bash
   dotnet run --project AiTeacher.Api --launch-profile http
   ```
   API default: `http://localhost:5199`.
2. Bu repoda Node.js 20+ ilə:
   ```bash
   npm start
   ```
3. Brauzerdə `http://localhost:5173` açın.

UI bütün `/api/*` sorğularını server tərəfindən `API_TARGET` ünvanına yönləndirir, buna görə lokal CORS ayarına ehtiyac qalmır.

Başqa port üçün:
```bash
API_TARGET=http://localhost:5000 PORT=5173 npm start
```
Windows PowerShell:
```powershell
$env:API_TARGET="http://localhost:5000"; npm start
```

## Test axını

- Admin hesabı ilə daxil olun; statistika və şagird siyahısına baxın, material əlavə edin və silin.
- Çıxış edin, yeni şagird yaradın (Register) və ya şagird hesabı ilə daxil olun.
- Yeni söhbət yaradın; API-nin form cavabı chatda həqiqi input/select kimi görünəcək.
- Formu doldurun, sonra dərs sualı göndərin.
- Chat cavabında `speech`, lövhə (`board`), `cues`, `sources`, serverdən gələn HTML/CSS form və raw JSON ayrıca görünür.
- Brauzerin text-to-speech imkanına görə səsi oxutmaq və jest zamanlama siqnallarını izləmək olar. Həqiqi 3D avatar daxil deyil.

Açarlar frontendə əlavə edilmir. Gemini və Cloudinary API açarları yalnız backend konfiqurasiyasında saxlanmalıdır.

## Test

```bash
npm test
```
