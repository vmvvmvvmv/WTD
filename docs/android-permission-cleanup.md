# Android 불필요한 권한 차단

작성일: 2026-10-25

## 확인한 문제

`mobile/android/app/src/main/AndroidManifest.xml`에 앱 기능에서 쓰지 않는 권한 네 개가 선언돼 있었음. `app.json`의 `android.permissions`에는 이 권한들이 없었지만, 네이티브 매니페스트와 라이브러리 권한은 별도로 최종 빌드에 합쳐질 수 있음. 기존 디버그 빌드의 병합 기록에서도 네 권한을 확인함.

| 권한 | 확인한 사용 범위 |
| --- | --- |
| `READ_EXTERNAL_STORAGE` | 앱 코드는 `expo-file-system`으로 앱 전용 폴더를 사용함. 라이브러리 매니페스트에도 이 권한이 있었음. |
| `WRITE_EXTERNAL_STORAGE` | 앱 코드는 앱 전용 폴더를 사용함. 라이브러리 매니페스트에도 이 권한이 있었음. |
| `RECORD_AUDIO` | 녹음 기능이나 마이크 권한 요청을 찾지 못함. |
| `SYSTEM_ALERT_WINDOW` | 일반 앱 화면에서 다른 앱 위에 표시하는 기능을 찾지 못함. 개발용 `debug` 매니페스트에는 별도 선언이 있음. |

## 수정 내용

- 메인 `AndroidManifest.xml`의 네 권한에 `tools:node="remove"`를 적용함. 이 줄은 권한 요청이 아니라 병합 결과에서 권한을 빼라는 표시임.
- `mobile/app.json`의 `android.blockedPermissions`에도 같은 네 권한을 넣음. Expo가 네이티브 파일을 다시 만들 때 쓰는 설정임.
- 위치, 인터넷, 진동, 정확한 알람 권한은 유지함.

## 확인 결과

- `app.json`을 JSON으로 읽었고 차단 목록 네 항목을 확인함.
- 메인 매니페스트를 XML로 읽었고 네 권한 모두 `tools:node="remove"`인지 확인함.
- Git diff로 수정 파일의 권한 변경을 확인함.

## 아직 확인할 것

- 최종 **배포용 APK/AAB**의 병합 권한 목록에 네 권한이 없는지 확인 필요. 이번에는 배포 빌드를 만들지 않았음.
- 실기기에서 앱 데이터 저장, 위치 선택, 알림이 정상 동작하는지 확인 필요.
- 개발용 디버그 빌드에는 개발 도구용 `SYSTEM_ALERT_WINDOW` 선언이 남아 있음. 배포 빌드 권한과 구분해서 확인해야 함.
