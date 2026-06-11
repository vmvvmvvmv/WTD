document.addEventListener("DOMContentLoaded", function() {
    const registerButton = document.getElementById('login');

    registerButton.addEventListener('click', function(event) {
        event.preventDefault();

        const id = document.getElementById('id').value.trim();
        const pw = document.getElementById('pw').value.trim();
        const repw = document.getElementById('repw').value.trim();
        const email = document.getElementById('email').value.trim();
        const nickname = document.getElementById('nickname').value.trim();

        // 유효성 검사
        if (id === '') {
            alert('아이디를 입력하세요.');
            return;
        }

        if (pw === '' || repw === '') {
            alert('비밀번호를 입력하세요.');
            return;
        }

        if (pw !== repw) {
            alert('비밀번호가 일치하지 않습니다.');
            return;
        }

        if (pw.length < 8) {
            alert('비밀번호는 최소 8자 이상이어야 합니다.');
            return;
        }

        const salt = generateRandomString(60);
        console.log(salt);

        // 비밀번호를 pbkdf2으로 해싱
        hashPasswordPBKDF2(pw, salt).then((hashedPw) => {
            const formData = new FormData();
            formData.append('id', id);
            formData.append('pw', hashedPw);  // 해싱된 비밀번호
            formData.append('salt', salt); // salt값
            if (email) formData.append('email', email);  // 이메일이 선택적으로 입력되었을 때만 추가
            if (nickname) formData.append('nickname', nickname);  // 별명이 선택적으로 입력되었을 때만 추가

            // 서버로 데이터 전송
            fetch('/api/register/', {
                method: 'POST',
                body: formData,
                headers: {
                    'X-CSRFToken': csrfToken,  // Django CSRF 토큰
                }
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    alert('회원가입이 완료되었습니다.');
                    window.location.href = '/nidLogin/';  // 로그인 페이지로 리디렉션
                } else {
                    alert(data.message || '회원가입에 실패했습니다.');
                }
            })
            .catch(error => {
                console.error('Error:', error);
                alert('서버 요청 중 오류가 발생했습니다.');
            });
        }).catch(error => {
            console.error('Error in password hashing:', error);
            alert('비밀번호 해싱에 실패했습니다.');
        });
    });

    async function hashPasswordPBKDF2(password, salt) {
        const encoder = new TextEncoder(); // 문자열을 바이트 배열로 인코딩
        const passwordBytes = encoder.encode(password); // 비밀번호를 바이트로 변환
        const saltBytes = encoder.encode(salt); // salt를 바이트로 변환

        // 비밀번호와 salt를 사용해 PBKDF2 키 파생
        const key = await crypto.subtle.importKey(
        'raw',
        passwordBytes,
        { name: 'PBKDF2' },
        false,
        ['deriveKey']
        );

        // PBKDF2를 사용해 비밀번호 해싱
        const pbkdf2Key = await crypto.subtle.deriveKey(
        {
          name: 'PBKDF2',
          salt: saltBytes,
          iterations: 100000,  // 반복 횟수
          hash: 'SHA-256',     // 해시 알고리즘
        },
        key,
        { name: 'HMAC', hash: 'SHA-256', length: 256 },
        false,
        ['sign']
        );

        // 결과 해시를 ArrayBuffer로 반환
        const hashBuffer = await crypto.subtle.sign('HMAC', pbkdf2Key, passwordBytes);

        // ArrayBuffer를 16진수 문자열로 변환
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(byte => byte.toString(16).padStart(2, '0')).join('');

        return hashHex;
    }

    function generateRandomString(length) {
        const array = new Uint8Array(length);
        crypto.getRandomValues(array);
        const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        return Array.from(array, byte => characters[byte % characters.length]).join('');
    }
});