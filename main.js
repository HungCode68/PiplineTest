// server.js

const express = require('express');
const bodyParser = require('body-parser');
const sql = require('mssql');
const randomstring = require('randomstring');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const app = express();

// Middleware
app.use(bodyParser.json());
app.use(cors());

// Cấu hình kết nối cơ sở dữ liệu SQL Server
const dbConfig = {
    user: 'sa',
    password: '123',
    server: 'DESKTOP-3PRKE5G',
    database: 'Students',
    options: {
        encrypt: true, // Sử dụng nếu bạn đang trên Windows Azure
        trustServerCertificate: true // Đặt thành true cho phát triển cục bộ / chứng chỉ tự ký
    }
};

const saltRounds = 10;

const JWT_SECRET = '943798c80a60d263667daadc54f88b55ec775c9a2f6f612e506be6621800cf0fe51b5621a7b5312b53de3215e3f74a75a72a57e6080f67e5b56c1dd0cfc83048'; // In a real application, use an environment variable

// Middleware for verifying JWT
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token == null) return res.sendStatus(401);

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
};



const users_db = [
    { username: "HungDepZai", password: "123", phone: "84398954835" },
    { username: "Hung", password: "5678", phone: "84398954835" },
];

// Lưu trữ OTP theo người dùng (Sử dụng đối tượng để tránh xung đột giữa các người dùng)
const userOtps = {};

// Endpoint đăng nhập
app.post("/login/otp", async (req, res) => {
    const { username, password } = req.body;
    const user = users_db.find(
        (user) => user.username === username && user.password === password
    );

    if (user) {
        // Generate OTP
        const otp = randomstring.generate({
            length: 4,
            charset: "numeric",
        });
        userOtps[username] = otp; // Store OTP for the user

        console.log("Generated OTP for", username, ": ", otp);

        // Prepare headers for the OTP sending API request
        const myHeaders = new fetch.Headers();
        myHeaders.append(
            "Authorization",
            "Bearer eyJjdHkiOiJzdHJpbmdlZS1hcGk7dj0xIiwidHlwIjoiSldUIiwiYWxnIjoiSFMyNTYifQ.eyJqdGkiOiJTSy4wLmdMMVhoTHRtcnJwRUhaUjNYbm4zMWdpN1czZ0l3YVFYLTE3MjcyODc1MjEiLCJpc3MiOiJTSy4wLmdMMVhoTHRtcnJwRUhaUjNYbm4zMWdpN1czZ0l3YVFYIiwiZXhwIjoxNzI5ODc5NTIxLCJyZXN0X2FwaSI6dHJ1ZX0.GsN0BFOcbZjWdadbFQ3leXY0uSiuhEEsx_ssECBjnbA"
        );

        const raw = JSON.stringify({
            "from": {
                "type": "external",
                "number": "842471082883",
                "alias": "STRINGEE_NUMBER"
            },
            "to": [
                {
                    "type": "external",
                    "number": user.phone,
                    "alias": "TO_NUMBER"
                }
            ],
            "answer_url": "https://example.com/answerurl",
            "actions": [
                {
                    "action": "talk",
                    "text": `Hello, your verification code is ${otp}`
                }
            ]
        });

        const requestOptions = {
            method: "POST",
            headers: myHeaders,
            body: raw,
            redirect: "follow",
        };

        try {
            const response = await fetch("https://api.stringee.com/v1/call2/callout", requestOptions);
            const result = await response.text();
            console.log(result);
            res.status(200).json({ message: 'OTP sent successfully' });
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Error occurred while sending OTP!' });
        }
    } else {
        res.status(401).json({ message: 'Sai thông tin đăng nhập hoặc mật khẩu' });
    }
});

// Endpoint xác nhận OTP
app.post('/confirm/otp', (req, res) => {
    const { username, userotp } = req.body;
    const user = users_db.find(
        (user) => user.username === username
    );

    if (user && userOtps[username] === userotp) {
        // Xóa OTP sau khi xác nhận thành công
        delete userOtps[username];
        res.status(200).json({ message: 'Login Thành Công' });
    } else {
        res.status(401).json({ message: 'Sai OTP' });
    }
});

// Login endpoint
app.post('/login/jwt', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ message: 'Username and password are required' });
        }

        const pool = await sql.connect(dbConfig);
        const result = await pool.request()
            .input('username', sql.VarChar, username)
            .query('SELECT * FROM Users WHERE Username = @username');

        const user = result.recordset[0];

        if (!user) {
            console.log('User not found:', username);
            return res.status(401).json({ message: 'Sai thông tin đăng nhập hoặc mật khẩu' });
        }

        console.log('Retrieved user:', { ...user, PasswordHash: '[REDACTED]' });

        if (!user.PasswordHash) {
            console.log('PasswordHash is null or undefined for user:', username);
            return res.status(500).json({ message: 'Error during login' });
        }

        const isMatch = await bcrypt.compare(password, user.PasswordHash);

        if (isMatch) {
            const token = jwt.sign({ username: user.Username, role: user.Role }, JWT_SECRET, { expiresIn: '1h' });
            res.json({ token, message: 'Login successful' });
        } else {
            console.log('Password mismatch for user:', username);
            res.status(401).json({ message: 'Sai thông tin đăng nhập hoặc mật khẩu' });
        }
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ message: 'Error during login' });
    }
});

async function hashPasswords() {
    try {
        await sql.connect(dbConfig);
        const result = await sql.query`SELECT UserID, Username, PasswordHash FROM Users`;

        for (const user of result.recordset) {
            if (!user.PasswordHash) {
                console.log(`Skipping user ${user.Username} due to null or undefined password`);
                continue;
            }

            try {
                const hashedPassword = await bcrypt.hash(user.PasswordHash, saltRounds);
                await sql.query`UPDATE Users SET PasswordHash = ${hashedPassword} WHERE UserID = ${user.UserID}`;
                console.log(`Updated password for user: ${user.Username}`);
            } catch (hashError) {
                console.error(`Error hashing password for user ${user.Username}:`, hashError);
            }
        }

        console.log('All passwords have been processed.');
    } catch (err) {
        console.error('Database error:', err);
    } finally {
        await sql.close();
    }
}

hashPasswords().then(() => console.log('Password hashing complete.'));

// Protected route example
app.get('/protected', authenticateToken, (req, res) => {
    res.json({ message: 'This is a protected route', user: req.user });
});

// -------------------- Hệ Thống Đăng Nhập với OTP --------------------

// Danh sách người dùng (Trong thực tế, bạn nên lưu trữ trong cơ sở dữ liệu)




// -------------------- Hệ Thống Quản Lý Sinh Viên, Giáo Viên, Lớp Học, Lịch Thi, Điểm Số --------------------

// Endpoint thêm sinh viên
app.post('/addStudent', async (req, res) => {
    try {
        const pool = await sql.connect(dbConfig);
        const { maSV, hoTen, lop, nganhHoc, khoa } = req.body;
        const query = `
            INSERT INTO Students (MaSV, HoTen, Lop, NganhHoc, Khoa)
            VALUES (@maSV, @hoTen, @lop, @nganhHoc, @khoa)
        `;
        await pool.request()
            .input('maSV', sql.VarChar, maSV)
            .input('hoTen', sql.NVarChar, hoTen)
            .input('lop', sql.VarChar, lop)
            .input('nganhHoc', sql.NVarChar, nganhHoc)
            .input('khoa', sql.NVarChar, khoa)
            .query(query);

        res.send('Thêm Sinh Viên Thành Công!');
    } catch (err) {
        console.error(err);
        res.status(500).send('Lỗi!');
    }
});

// Endpoint thêm giáo viên
app.post('/addTeacher', async (req, res) => {
    try {
        const pool = await sql.connect(dbConfig);
        const { maGV, hoTen, nganhDay, maHP } = req.body;
        const query = `
            INSERT INTO Teacher (MaGV, HoTen, NganhDay, MaHP)
            VALUES (@maGV, @hoTen, @nganhDay, @maHP)
        `;
        await pool.request()
            .input('maGV', sql.VarChar, maGV)
            .input('hoTen', sql.NVarChar, hoTen)
            .input('nganhDay', sql.NVarChar, nganhDay)
            .input('maHP', sql.VarChar, maHP)
            .query(query);

        res.send('Thêm Giáo Viên Thành Công!');
    } catch (err) {
        console.error(err);
        res.status(500).send('Lỗi!');
    }
});

// Endpoint thêm lớp học
app.post('/addClass', async (req, res) => {
    try {
        const pool = await sql.connect(dbConfig);
        const { lop, siSo, diaDiem } = req.body;
        const query = `
            INSERT INTO Class (Lop, SiSo, DiaDiem)
            VALUES (@lop, @siSo, @diaDiem)
        `;
        await pool.request()
            .input('lop', sql.VarChar, lop)
            .input('siSo', sql.VarChar, siSo)
            .input('diaDiem', sql.VarChar, diaDiem)
            .query(query);

        res.send('Thêm Lớp Thành Công!');
    } catch (err) {
        console.error(err);
        res.status(500).send('Lỗi!');
    }
});

// Endpoint thêm lịch thi
app.post('/addCalender', async (req, res) => {
    try {
        const pool = await sql.connect(dbConfig);
        const { maHP, tenHP, ngayThi, phongThi, thoiGian } = req.body;
        const query = `
            INSERT INTO Calender (MaHP, TenHP, NgayThi, PhongThi, ThoiGian)
            VALUES (@maHP, @tenHP, @ngayThi, @phongThi, @thoiGian)
        `;
        await pool.request()
            .input('maHP', sql.VarChar, maHP)
            .input('tenHP', sql.NVarChar, tenHP)
            .input('ngayThi', sql.VarChar, ngayThi)
            .input('phongThi', sql.VarChar, phongThi)
            .input('thoiGian', sql.VarChar, thoiGian)
            .query(query);

        res.send('Thêm Lịch Thi Thành Công!');
    } catch (err) {
        console.error(err);
        res.status(500).send('Lỗi!');
    }
});

// Endpoint thêm điểm
app.post('/addGrade', async (req, res) => {
    try {
        const pool = await sql.connect(dbConfig);
        const { maSV, id, tenHP, diemHe10 } = req.body;
        const query = `
            INSERT INTO Grade (MaSV, ID, TenHP, DiemHe10)
            VALUES (@maSV, @id, @tenHP, @diemHe10)
        `;
        await pool.request()
            .input('maSV', sql.VarChar, maSV)
            .input('id', sql.Int, id)
            .input('tenHP', sql.NVarChar, tenHP)
            .input('diemHe10', sql.Float, diemHe10)
            .query(query);

        res.send('Thêm Điểm Thành Công!');
    } catch (err) {
        console.error(err);
        res.status(500).send('Lỗi!');
    }
});

// Endpoint lấy danh sách sinh viên
app.get('/getStudents', async (req, res) => {
    try {
        const pool = await sql.connect(dbConfig);
        const result = await pool.request().query('SELECT * FROM Students');
        res.json(result.recordset);
    } catch (err) {
        console.error(err);
        res.status(500).send('Lỗi!');
    }
});

// Endpoint lấy danh sách giáo viên
app.get('/getTeachers', async (req, res) => {
    try {
        const pool = await sql.connect(dbConfig);
        const result = await pool.request().query('SELECT * FROM Teacher');
        res.json(result.recordset);
    } catch (err) {
        console.error(err);
        res.status(500).send('Lỗi!');
    }
});

// Endpoint lấy danh sách lớp học
app.get('/getClasses', async (req, res) => {
    try {
        const pool = await sql.connect(dbConfig);
        const result = await pool.request().query('SELECT * FROM Class');
        res.json(result.recordset);
    } catch (err) {
        console.error(err);
        res.status(500).send('Lỗi!');
    }
});

// Endpoint lấy danh sách lịch thi
app.get('/getCalenders', async (req, res) => {
    try {
        const pool = await sql.connect(dbConfig);
        const result = await pool.request().query('SELECT * FROM Calender');
        res.json(result.recordset);
    } catch (err) {
        console.error(err);
        res.status(500).send('Lỗi!');
    }
});

// Endpoint lấy điểm của sinh viên theo MaSV
app.get('/getGrades/:MaSV', async (req, res) => {
    const { MaSV } = req.params;

    try {
        const pool = await sql.connect(dbConfig);
        const result = await pool.request()
            .input('MaSV', sql.VarChar, MaSV)
            .query(`
                SELECT g.TenHP, g.DiemHe10
                FROM Grade g
                JOIN Students s ON g.MaSV = s.MaSV
                WHERE s.MaSV = @MaSV
            `);

        res.json(result.recordset); // Trả về danh sách các môn học và điểm
    } catch (err) {
        console.error(err);
        res.status(500).send('Lỗi khi truy xuất dữ liệu!');
    }
});

// Endpoint xóa sinh viên
app.delete('/deleteStudent/:maSV', async (req, res) => {
    const { maSV } = req.params;
    try {
        const pool = await sql.connect(dbConfig);
        const query = `DELETE FROM Students WHERE MaSV = @maSV`;
        const result = await pool.request()
            .input('maSV', sql.VarChar, maSV)
            .query(query);

        if (result.rowsAffected[0] > 0) {
            res.send('Xóa Sinh Viên Thành Công');
        } else {
            res.status(404).send('Không tìm thấy sinh viên!');
        }
    } catch (err) {
        console.error(err);
        res.status(500).send('Lỗi!');
    }
});

// Endpoint xóa giáo viên
app.delete('/deleteTeacher/:maGV', async (req, res) => {
    const { maGV } = req.params;
    try {
        const pool = await sql.connect(dbConfig);
        const query = `DELETE FROM Teacher WHERE MaGV = @maGV`;
        const result = await pool.request()
            .input('maGV', sql.VarChar, maGV)
            .query(query);

        if (result.rowsAffected[0] > 0) {
            res.send('Xóa Giáo Viên Thành Công');
        } else {
            res.status(404).send('Không tìm thấy giáo viên!');
        }
    } catch (err) {
        console.error(err);
        res.status(500).send('Lỗi!');
    }
});

// Endpoint xóa lớp học
app.delete('/deleteClass/:lop', async (req, res) => {
    const { lop } = req.params;
    try {
        const pool = await sql.connect(dbConfig);
        const query = `DELETE FROM Class WHERE Lop = @lop`;
        const result = await pool.request()
            .input('lop', sql.VarChar, lop)
            .query(query);

        if (result.rowsAffected[0] > 0) {
            res.send('Xóa Lớp Thành Công');
        } else {
            res.status(404).send('Không tìm thấy lớp học!');
        }
    } catch (err) {
        console.error(err);
        res.status(500).send('Lỗi!');
    }
});

// Endpoint xóa lịch thi
app.delete('/deleteCalender/:maHP', async (req, res) => {
    const { maHP } = req.params;
    try {
        const pool = await sql.connect(dbConfig);
        const query = `DELETE FROM Calender WHERE MaHP = @maHP`;
        const result = await pool.request()
            .input('maHP', sql.VarChar, maHP)
            .query(query);

        if (result.rowsAffected[0] > 0) {
            res.send('Xóa Lịch Thi Thành Công');
        } else {
            res.status(404).send('Không tìm thấy lịch thi!');
        }
    } catch (err) {
        console.error(err);
        res.status(500).send('Lỗi!');
    }
});

// Endpoint tìm kiếm sinh viên
app.get('/searchStudents', async (req, res) => {
    try {
        const { MaSV, HoTen } = req.query;

        // Xây dựng điều kiện tìm kiếm dựa trên các tham số
        let query = 'SELECT * FROM Students WHERE 1=1';
        let parameters = [];

        if (MaSV) {
            query += ' AND MaSV = @maSV';
            parameters.push({ name: 'MaSV', type: sql.VarChar, value: MaSV });
        }

        if (HoTen) {
            query += ' AND HoTen LIKE @hoTen';
            parameters.push({ name: 'HoTen', type: sql.VarChar, value: `%${HoTen}%` });
        }

        const pool = await sql.connect(dbConfig);
        const request = pool.request();

        // Thêm các tham số vào request
        parameters.forEach(param => request.input(param.name, param.type, param.value));

        const result = await request.query(query);
        res.json(result.recordset);
    } catch (err) {
        console.error(err);
        res.status(500).send('Lỗi!');
    }
});

app.get('/searchTeachers', async (req, res) => {
    try {
        const { MaGV, HoTen } = req.query;

        // Xây dựng điều kiện tìm kiếm dựa trên các tham số
        let query = 'SELECT * FROM Teacher WHERE 1=1';
        let parameters = [];

        if (MaGV) {
            query += ' AND MaGV = @maGV';
            parameters.push({ name: 'MaGV', type: sql.VarChar, value: MaGV });
        }

        if (HoTen) {
            query += ' AND HoTen LIKE @hoTen';
            parameters.push({ name: 'HoTen', type: sql.VarChar, value: `%${HoTen}%` });
        }

        const pool = await sql.connect(dbConfig);
        const request = pool.request();

        // Thêm các tham số vào request
        parameters.forEach(param => request.input(param.name, param.type, param.value));

        const result = await request.query(query);
        res.json(result.recordset);
    } catch (err) {
        console.error(err);
        res.status(500).send('Lỗi!');
    }
});

app.put('/updateGrade', async (req, res) => {
    try {
        const { maSV, id, tenHP, diemHe10 } = req.body;

        const pool = await sql.connect(dbConfig);
        const query = `
            UPDATE Grade
            SET TenHP = @tenHP, DiemHe10 = @diemHe10
            WHERE MaSV = @maSV AND ID = @id
        `;
        const result = await pool.request()
            .input('maSV', sql.VarChar, maSV)
            .input('id', sql.Int, id)
            .input('tenHP', sql.NVarChar, tenHP)
            .input('diemHe10', sql.Float, diemHe10)
            .query(query);

        if (result.rowsAffected[0] > 0) {
            res.send('Cập Nhật Điểm Thành Công!');
        } else {
            res.status(404).send('Không Tìm Thấy Sinh Viên!');
        }
    } catch (err) {
        console.error(err);
        res.status(500).send('Lỗi!');
    }
});



app.listen(3000, () => {
    console.log('Server is running on port 3000');
});