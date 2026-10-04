# KrishiBazar Backend (Node.js + MySQL + Railway)

## Local setup
1. `npm install`
2. `.env.example` copy kore `.env` banan, value gulo boshan
3. `npm run seed:admin`  (table + admin user toiri hobe)
4. `npm run dev`

## Railway deploy
1. Code GitHub-e push korun (.env push korben na)
2. Railway -> New Project -> Deploy from GitHub repo
3. Same project-e "Add -> Database -> MySQL"
4. Node service-er Variables e:
   - MYSQL_URL = ${{MySQL.MYSQL_URL}}   (reference variable)
   - JWT_SECRET, CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET
5. Settings -> Networking -> Generate Domain (eita Flutter-er baseUrl)
6. Admin banate: Railway shell/CLI te `npm run seed:admin` (ba local theke
   MYSQL_URL e Railway-r public MySQL URL diye seed chalan)

## Postman test order
POST /auth/register -> POST /auth/login (token nin) -> Authorization: Bearer <token>
-> POST /products (form-data) -> GET /products -> POST /orders -> GET /orders
-> admin login -> GET /admin/stats, GET /admin/users?status=pending, PUT /admin/users/1/approve
