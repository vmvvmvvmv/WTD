document.addEventListener("DOMContentLoaded", function() {
    const csrfToken = getCookie("csrftoken");
    const updateButton = document.getElementById('edit');
    const updateForm = document.querySelector('form');

    updateButton.addEventListener('click', function(event) {
        event.preventDefault();

        const email = document.getElementById('email').value.trim();
        const region = document.getElementById('region').value.trim();
        const diseases = document.getElementById('diseases').value.trim();
        // const pw1 = document.getElementById('pw').value.trim();
        // const pw2 = document.getElementById('pw').value.trim(); // 필요시 오픈

        if (region === '') {
            alert('지역을 입력하세요.');
            return;
        }

        // 업데이트 요청 날리기
        updateUser(email, region, diseases);
    });

    // 업데이트 요청 함수
    function updateUser(email, region, diseases) {
        fetch('/api/update/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',  // 데이터 형식을 JSON으로 설정
                'X-CSRFToken': getCookie('csrftoken'),  // Django CSRF 토큰 (필요시)
            },
            body: JSON.stringify({
                email: email,
                region: region,
                diseases: diseases
            })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                alert("내 정보를 수정하였습니다.");
                location.href = "/mypage";
            } else {
                alert("정보 수정을 실패하였습니다.\n"+ data.message);
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

});