// PreToolUse 훅: AI가 .env 파일을 읽거나 출력하지 못하게 막는다(.env.example 같은 예시 파일은 허용).
// 입력은 Claude Code가 stdin으로 주는 JSON이다.
let raw = '';
process.stdin.on('data', (chunk) => { raw += chunk; });
process.stdin.on('end', () => {
  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    return; // 형식을 모르면 막지 않는다.
  }
  const toolInput = input.tool_input ?? {};
  const targets = [toolInput.file_path, toolInput.path, toolInput.pattern, toolInput.glob, toolInput.command]
    .filter((value) => typeof value === 'string');

  // 경로 구분자·공백·따옴표 뒤의 ".env" 또는 ".env.local" 등. process.env, dotenv 같은 코드 문자열은 걸리지 않는다.
  const envFile = /(^|[\\/\s"'`=:(*])\.env(\.[\w.-]+)?(?=$|[\s"'`;|&)<>,*])/g;
  const allowed = /^\.(example|sample|template)$/;
  const hit = targets.some((text) => [...text.matchAll(envFile)].some((match) => !allowed.test(match[2] ?? '')));
  if (!hit) return;

  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: '.env 파일은 열거나 출력하지 않는 규칙입니다(AGENTS.md). 값이 필요하면 사용자에게 확인을 요청하세요. 예시 파일(.env.example)은 읽을 수 있습니다.',
    },
  }));
});
