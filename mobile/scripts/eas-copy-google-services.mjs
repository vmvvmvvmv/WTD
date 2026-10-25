// EAS 빌드 서버에서만 쓴다. google-services.json은 비밀이라 저장소에 없으므로(.gitignore),
// EAS 환경변수(파일 타입) GOOGLE_SERVICES_JSON으로 받은 파일을 Gradle이 찾는 자리에 복사한다.
import { copyFileSync, existsSync } from 'node:fs';

const source = process.env.GOOGLE_SERVICES_JSON;
const target = 'android/app/google-services.json';
if (!source || !existsSync(source)) {
  console.error('GOOGLE_SERVICES_JSON(EAS 파일 환경변수)가 없어 google-services.json을 넣지 못했습니다.');
  process.exit(1);
}
copyFileSync(source, target);
console.log(`google-services.json -> ${target}`);
