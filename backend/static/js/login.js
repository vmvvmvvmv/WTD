document.addEventListener("DOMContentLoaded", function() {
    const csrfToken = getCookie("csrftoken");
    const loginButton = document.getElementById('login');
    const loginForm = document.querySelector('form');

    loginButton.addEventListener('click', function(event) {
        event.preventDefault();

        const id = document.getElementById('id').value.trim();
        const pw = document.getElementById('pw').value.trim();

        if (id === '') {
            alert('아이디를 입력하세요.');
            return;
        }

        if (pw === '') {
            alert('비밀번호를 입력하세요.');
            return;
        }

        // 서버에서 salt 값을 받아오는 함수 호출
        getSalt(id).then(salt => {
            if (salt) {
                // 비밀번호 해싱 후 로그인 요청
                hashPasswordPBKDF2(pw, salt).then((hashedPw) => {
                    loginUser(id, hashedPw); // 로그인 요청
                }).catch(error => {
                    console.error('Error in password hashing:', error);
                    alert('비밀번호 해싱에 실패했습니다.');
                });
            } else {
                alert('salt 값을 받아오지 못했습니다.');
            }
        }).catch(error => {
            console.error('Error fetching salt:', error);
            alert('salt 값을 받아오는 데 실패했습니다.');
        });
    });

    // 서버에서 salt 값을 받아오는 함수
    function getSalt(id) {
        return fetch('/api/s/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',  // 데이터 형식을 JSON으로 설정
                'X-CSRFToken': getCookie('csrftoken'),  // Django CSRF 토큰 (필요시)
            },
            body: JSON.stringify({ id: id })
        })
        .then(response => response.json())
        .then(data => data.salt);  // 서버에서 받은 salt 반환
    }

    // 로그인 요청 함수
    function loginUser(id, hashedPw) {
        fetch('/api/login/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',  // 데이터 형식을 JSON으로 설정
                'X-CSRFToken': getCookie('csrftoken'),  // Django CSRF 토큰 (필요시)
            },
            body: JSON.stringify({
                id: id,
                pw: hashedPw
            })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
//                alert("로그인에 성공했습니다.");
                if(data.data.session_id) {
                    document.cookie = `sessionid=${data.data.session_id}; path=/; Secure; SameSite=Strict`;
                    console.log(data.data.session_id);
                }
                if(data.data.csrftoken) {
                    document.cookie = `csrftoken=${data.data.csrftoken}; path=/; Secure; SameSite=Strict`;
                    let new_csrf = data.data.csrftoken;
                    console.log(new_csrf);
                }
                location.href = "/";
            } else {
                alert("로그인에 실패했습니다.");
            }
        })
        .catch(error => {
            console.error('Error during login:', error);
            alert('로그인 처리에 실패했습니다.' + error);
        });
    }

    // 비밀번호 해싱 함수
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

});