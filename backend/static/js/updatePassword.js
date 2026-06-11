document.addEventListener("DOMContentLoaded", function() {
    const csrfToken = getCookie("csrftoken");
    const updateButton = document.getElementById('edit');
    const updateForm = document.querySelector('form');
    const currentSalt = document.getElementById('salt').value;
    let newSalt;
    let currentPassword;
    let newPassword1;
    let newPassword2;


    updateButton.addEventListener('click', function(event) {
        event.preventDefault();

        currentPassword = document.getElementById('current_pass').value.trim();
        newPassword1 = document.getElementById('new_pass1').value.trim();
        newPassword2 = document.getElementById('new_pass2').value.trim();
        // const pw1 = document.getElementById('pw').value.trim();
        // const pw2 = document.getElementById('pw').value.trim(); // 필요시 오픈

        if (currentPassword === '' || newPassword1 === '' || newPassword2 === '') {
            alert('모든 입력란을 채워주세요');
            return;
        }

        if (newPassword1 !== newPassword2) {
            alert('변경할 비밀번호가 일치하지 않습니다.');
            return;
        }

        // 업데이트 요청 날리기
        updatePassword(currentPassword, newPassword1);
    });

    // 업데이트 요청 함수
    async function updatePassword(currentPassword, newPassword) {
        newSalt = generateRandomString(50);
        console.log(currentSalt + " > " + newSalt);
        const encryptedCurrentPassword = await hashPasswordPBKDF2(currentPassword, currentSalt);
        const encryptedNewPassword = await hashPasswordPBKDF2(newPassword1, newSalt);

        fetch('/api/updatePassword/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',  // 데이터 형식을 JSON으로 설정
                'X-CSRFToken': getCookie('csrftoken'),  // Django CSRF 토큰 (필요시)
            },
            body: JSON.stringify({
                current_password: encryptedCurrentPassword,
                new_password: encryptedNewPassword,
                new_salt: newSalt,
            })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                alert("비밀번호를 수정하였습니다.\n다시 로그인 해 주세요");
                location.href = '/';
            } else {
                alert("\n"+ data.message);
            }
        })
        .catch(error => {
            console.error('Error during update:', error);
            alert('error occurred: ' + error);
        });
    }


    function getCookie(name) {
        let cookieValue = null;
        if (document.cookie && document.cookie !== "") {
            const cookies = document.cookie.split(";");  // 쿠키를 세미콜론으로 분리
            for (let i = 0; i < cookies.length; i++) {
                const cookie = cookies[i].trim();  // 공백 제거
                // 쿠키 이름이 일치하면 값을 추출
                if (cookie.startsWith(name + "=")) {
                    cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                    break;
                }
            }
        }
        return cookieValue;
    }

    async function hashPasswordPBKDF2(password, salt) {
        const encoder = new TextEncoder(); // 문자열을 바이트 배열로 인코딩
        const passwordBytes = encoder.encode(password); // 비밀번호를 바이트로 변환
        const saltBytes = encoder.encode(salt); // salt를 바이트로 변환

        // 비밀번호와 salt를 사용해 PBKDF2 키 파생
        const key = await crypto.subtle.importKey('raw', passwordBytes, { name: 'PBKDF2' }, false, ['deriveKey']);

        // PBKDF2를 사용해 비밀번호 해싱
        const pbkdf2Key = await crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt: saltBytes,
            iterations: 100000,  // 반복 횟수
            hash: 'SHA-256',     // 해시 알고리즘
        },
        key,
        {
            name: 'HMAC',
            hash: 'SHA-256',
            length: 256
        },
        false,
        ['sign']);

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