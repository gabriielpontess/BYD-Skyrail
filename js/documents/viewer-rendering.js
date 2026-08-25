export const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

export function fitWidthScale({pageWidth,stageWidth,padding=24,min=.2,max=4}){
  const width=Math.max(1,Number(pageWidth)||1);
  const available=Math.max(120,(Number(stageWidth)||0)-padding);
  return clamp(available/width,min,max);
}

export function renderPixelRatio({viewportWidth,viewportHeight,devicePixelRatio=1,quality=1.25,maxPixels=32000000,maxRatio=3}){
  const width=Math.max(1,Number(viewportWidth)||1);
  const height=Math.max(1,Number(viewportHeight)||1);
  const dpr=Math.max(1,Number(devicePixelRatio)||1);
  const target=Math.min(maxRatio,dpr*quality);
  const pixelCap=Math.sqrt(Math.max(1,maxPixels)/(width*height));
  return clamp(Math.min(target,pixelCap),1,maxRatio);
}

export function zoomLabel(scale,fitMode=false){
  const percent=`${Math.round((Number(scale)||1)*100)}%`;
  return fitMode?`Ajustar · ${percent}`:percent;
}
