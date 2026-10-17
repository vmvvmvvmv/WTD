import { useState } from 'react';

// 지역을 바꿔 새 데이터를 불러오는 동안인지 알려줍니다. 홈은 이 값으로 배너 자리에 뼈대(HomeBannerSkeleton)를 보여줍니다.
export function useRegionTransition() {
  const [isTransitioning, setIsTransitioning] = useState(false);
  return {
    finish: () => setIsTransitioning(false),
    isTransitioning,
    start: () => setIsTransitioning(true),
  };
}
