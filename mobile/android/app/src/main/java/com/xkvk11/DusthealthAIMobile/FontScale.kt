package com.xkvk11.DusthealthAIMobile

import android.content.Context
import android.content.res.Configuration

// 휴대폰 글자 크기를 크게 해 둬도 앱 글자는 이 배율까지만 커지게 합니다(작은 화면에서 줄바꿈·잘림 방지).
private const val MAX_FONT_SCALE = 1.15f

// 글자 배율만 덮어쓴 Context. 다른 설정(다크 모드·언어 등)은 그대로 따라갑니다.
// ponytail: 앱이 떠 있는 동안 글자 크기를 한도 아래로 줄이면 앱을 다시 켤 때까지 1.15배로 남음. 필요하면 onConfigurationChanged에서 다시 계산.
fun Context.withCappedFontScale(): Context {
  if (resources.configuration.fontScale <= MAX_FONT_SCALE) return this
  return createConfigurationContext(Configuration().apply { fontScale = MAX_FONT_SCALE })
}
