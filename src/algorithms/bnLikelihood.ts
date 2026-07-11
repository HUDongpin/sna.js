// Ported from R sna 2.8: R/models.R `bn` likelihood helpers (bn.nlpl.*, bn.nltl).
/*
 * Browser-safe port of the Skvoretz triadic biased-net likelihood table
 * from R sna 2.8 src/likelihood.c:bn_lpt.
 */

export function bnTriadLogProbability(
  xy: number,
  yx: number,
  yz: number,
  zy: number,
  xz: number,
  zx: number,
  kxy: number,
  kyz: number,
  kxz: number,
  pi: number,
  sigma: number,
  rho: number,
  d: number,
): number {
  return bnLpt(xy, yx, yz, zy, xz, zx, kxy, kyz, kxz, pi, sigma, rho, d);
}

function bnLptM(m: number, pi: number, sigma: number, rho: number, d: number): number {
  return safeLog(1 - (1 - pi) * (1 - rho) ** m * (1 - sigma) ** m * (1 - d)) + safeLog(1 - (1 - sigma) ** m * (1 - d));
}

function bnLptA(m: number, pi: number, sigma: number, rho: number, d: number): number {
  return safeLog(1 - (1 - sigma) ** m * (1 - d)) + safeLog((1 - pi) * (1 - rho) ** m * (1 - sigma) ** m * (1 - d));
}

function bnLptN(m: number, pi: number, sigma: number, rho: number, d: number): number {
  const calc = 1 - Math.exp(bnLptM(m, pi, sigma, rho, d)) - 2 * Math.exp(bnLptA(m, pi, sigma, rho, d));
  return safeLog(Math.max(0, calc));
}

function bnLptMp1(m: number, pi: number, sigma: number, rho: number, d: number): number {
  return bnLptM(m + 1, pi, sigma, rho, d);
}

function bnLptAp1(m: number, pi: number, sigma: number, rho: number, d: number): number {
  return bnLptA(m + 1, pi, sigma, rho, d);
}

function bnLptNp1(m: number, pi: number, sigma: number, rho: number, d: number): number {
  return bnLptN(m + 1, pi, sigma, rho, d);
}

function bnLptM1(_pi: number, sigma: number, rho: number, _d: number): number {
  return safeLog(sigma * (1 - (1 - sigma) * (1 - rho)));
}

function bnLptA1(_pi: number, sigma: number, rho: number, _d: number): number {
  return safeLog(sigma * (1 - sigma) * (1 - rho));
}

function bnLptN1(_pi: number, sigma: number, rho: number, _d: number): number {
  return safeLog(1 - sigma * (1 + (1 - sigma) * (1 - rho)));
}

function bnLptSr(_pi: number, sigma: number, rho: number, _d: number): number {
  return safeLog(1 - (1 - sigma) * (1 - rho));
}

function bnLptOneMinusSr(_pi: number, sigma: number, rho: number, _d: number): number {
  return safeLog((1 - sigma) * (1 - rho));
}

function safeLog(value: number): number {
  return Math.log(Math.max(value, Number.MIN_VALUE));
}

function bnLpt(xy: number, yx: number, yz: number, zy: number, xz: number, zx: number, kxy: number, kyz: number, kxz: number, pi: number, sigma: number, rho: number, d: number): number {

  if(xy>0){
    if(yx>0){
      if(yz>0){
        if(zy>0){
          if(xz>0){
            if(zx>0){  /*1 1 1 1 1 1*/
              return safeLog((Math.exp(bnLptM(kxy,pi,sigma,rho,d) + bnLptM(kyz,pi,sigma,rho,d) + bnLptMp1(kxz,pi,sigma,rho,d)) + Math.exp(bnLptM(kxy,pi,sigma,rho,d) + bnLptMp1(kyz,pi,sigma,rho,d) + bnLptM(kxz,pi,sigma,rho,d))+Math.exp(bnLptMp1(kxy,pi,sigma,rho,d) + bnLptM(kyz,pi,sigma,rho,d) + bnLptM(kxz,pi,sigma,rho,d)))/3.0
+ (Math.exp(bnLptA(kxz,pi,sigma,rho,d) + bnLptSr(pi,sigma,rho,d))*(Math.exp(bnLptM(kxy,pi,sigma,rho,d) + bnLptMp1(kyz,pi,sigma,rho,d)) + 2.0*Math.exp(bnLptM(kxy,pi,sigma,rho,d) + bnLptM(kyz,pi,sigma,rho,d)) + Math.exp(bnLptMp1(kxy,pi,sigma,rho,d) + bnLptM(kyz,pi,sigma,rho,d)))
+ Math.exp(bnLptA(kyz,pi,sigma,rho,d) + bnLptSr(pi,sigma,rho,d))*(Math.exp(bnLptM(kxy,pi,sigma,rho,d) + bnLptMp1(kxz,pi,sigma,rho,d))+2.0*Math.exp(bnLptM(kxy,pi,sigma,rho,d) + bnLptM(kxz,pi,sigma,rho,d))+Math.exp(bnLptMp1(kxy,pi,sigma,rho,d) + bnLptM(kxz,pi,sigma,rho,d)))
+ Math.exp(bnLptA(kxy,pi,sigma,rho,d) + bnLptSr(pi,sigma,rho,d))*(Math.exp(bnLptMp1(kyz,pi,sigma,rho,d) + bnLptM(kxz,pi,sigma,rho,d))+2.0*Math.exp(bnLptM(kyz,pi,sigma,rho,d) + bnLptM(kxy,pi,sigma,rho,d) + bnLptM(kxz,pi,sigma,rho,d)) + Math.exp(bnLptM(kyz,pi,sigma,rho,d) + bnLptMp1(kxz,pi,sigma,rho,d))))/3.0
+4.0*(Math.exp(bnLptA(kxy,pi,sigma,rho,d) + bnLptM(kyz,pi,sigma,rho,d) + bnLptA(kxz,pi,sigma,rho,d) + bnLptSr(pi,sigma,rho,d) + bnLptSr(pi,sigma,rho,d))+Math.exp(bnLptM(kxy,pi,sigma,rho,d) + bnLptA(kyz,pi,sigma,rho,d) + bnLptA(kxz,pi,sigma,rho,d) + bnLptSr(pi,sigma,rho,d) + bnLptSr(pi,sigma,rho,d)) + Math.exp(bnLptA(kxy,pi,sigma,rho,d) + bnLptA(kyz,pi,sigma,rho,d) + bnLptM(kxz,pi,sigma,rho,d) + bnLptSr(pi,sigma,rho,d) + bnLptSr(pi,sigma,rho,d)))/3.0
+ (Math.exp(bnLptA(kxy,pi,sigma,rho,d) + bnLptA(kyz,pi,sigma,rho,d) + bnLptM(kxz,pi,sigma,rho,d) + bnLptSr(pi,sigma,rho,d) + bnLptSr(pi,sigma,rho,d)) + Math.exp(bnLptA(kxy,pi,sigma,rho,d) + bnLptM(kyz,pi,sigma,rho,d) + bnLptA(kxz,pi,sigma,rho,d) + bnLptSr(pi,sigma,rho,d) + bnLptSr(pi,sigma,rho,d)) + Math.exp(bnLptM(kxy,pi,sigma,rho,d) + bnLptA(kyz,pi,sigma,rho,d) + bnLptA(kxz,pi,sigma,rho,d) + bnLptSr(pi,sigma,rho,d) + bnLptSr(pi,sigma,rho,d)))/3.0);
            }else{     /*1 1 1 1 1 0*/
              return safeLog(Math.exp(bnLptM(kxy,pi,sigma,rho,d)) * (Math.exp(bnLptAp1(kxz,pi,sigma,rho,d) + bnLptM(kyz,pi,sigma,rho,d)) + Math.exp(bnLptA(kxz,pi,sigma,rho,d) + bnLptMp1(kyz,pi,sigma,rho,d) + bnLptOneMinusSr(pi,sigma,rho,d)) + Math.exp(bnLptA(kxz,pi,sigma,rho,d) + bnLptM(kyz,pi,sigma,rho,d) + bnLptOneMinusSr(pi,sigma,rho,d)))/3.0 + 2.0*Math.exp(bnLptM(kxy,pi,sigma,rho,d) + bnLptA(kyz,pi,sigma,rho,d) + bnLptA(kxz,pi,sigma,rho,d) + bnLptSr(pi,sigma,rho,d) + bnLptOneMinusSr(pi,sigma,rho,d))/3.0 + Math.exp(bnLptM(kxy,pi,sigma,rho,d) + bnLptA(kyz,pi,sigma,rho,d) + bnLptSr(pi,sigma,rho,d))*(Math.exp(bnLptAp1(kxz,pi,sigma,rho,d)) + Math.exp(bnLptA(kxz,pi,sigma,rho,d)+bnLptOneMinusSr(pi,sigma,rho,d)))/3.0);
            }
          }else{
            if(zx>0){  /*1 1 1 1 0 1*/
              return safeLog(Math.exp(bnLptM(kyz,pi,sigma,rho,d)) * (Math.exp(bnLptAp1(kxz,pi,sigma,rho,d) + bnLptM(kxy,pi,sigma,rho,d)) + Math.exp(bnLptA(kxz,pi,sigma,rho,d) + bnLptMp1(kxy,pi,sigma,rho,d) + bnLptOneMinusSr(pi,sigma,rho,d)) + Math.exp(bnLptA(kxz,pi,sigma,rho,d) + bnLptM(kxy,pi,sigma,rho,d) + bnLptOneMinusSr(pi,sigma,rho,d)))/3.0 + 2.0*Math.exp(bnLptA(kxy,pi,sigma,rho,d) + bnLptM(kyz,pi,sigma,rho,d) + bnLptA(kxz,pi,sigma,rho,d) + bnLptSr(pi,sigma,rho,d) + bnLptOneMinusSr(pi,sigma,rho,d))/3.0 + Math.exp(bnLptA(kxy,pi,sigma,rho,d) + bnLptM(kyz,pi,sigma,rho,d) + bnLptSr(pi,sigma,rho,d))*(Math.exp(bnLptAp1(kxz,pi,sigma,rho,d)) + Math.exp(bnLptA(kxz,pi,sigma,rho,d)+bnLptOneMinusSr(pi,sigma,rho,d)))/3.0);
            }else{     /*1 1 1 1 0 0*/
              return bnLptM(kxy,pi,sigma,rho,d) + bnLptM(kyz,pi,sigma,rho,d) + safeLog(Math.exp(bnLptNp1(kxz,pi,sigma,rho,d))+2.0*Math.exp(bnLptN(kxz,pi,sigma,rho,d))) - safeLog(3.0);
            }
          }
        }else{
          if(xz>0){ 
            if(zx>0){  /*1 1 1 0 1 1*/
              return safeLog(Math.exp(bnLptM(kxy,pi,sigma,rho,d)) * (Math.exp(bnLptAp1(kyz,pi,sigma,rho,d) + bnLptM(kxz,pi,sigma,rho,d)) + Math.exp(bnLptA(kyz,pi,sigma,rho,d) + bnLptMp1(kxz,pi,sigma,rho,d) + bnLptOneMinusSr(pi,sigma,rho,d)) + Math.exp(bnLptA(kyz,pi,sigma,rho,d) + bnLptM(kxz,pi,sigma,rho,d) + bnLptOneMinusSr(pi,sigma,rho,d)))/3.0 + 2.0*Math.exp(bnLptM(kxy,pi,sigma,rho,d) + bnLptA(kyz,pi,sigma,rho,d) + bnLptA(kxz,pi,sigma,rho,d) + bnLptSr(pi,sigma,rho,d) + bnLptOneMinusSr(pi,sigma,rho,d))/3.0 + Math.exp(bnLptM(kxy,pi,sigma,rho,d) + bnLptA(kxz,pi,sigma,rho,d) + bnLptSr(pi,sigma,rho,d))*(Math.exp(bnLptAp1(kyz,pi,sigma,rho,d)) + Math.exp(bnLptA(kyz,pi,sigma,rho,d)+bnLptOneMinusSr(pi,sigma,rho,d)))/3.0);
            }else{     /*1 1 1 0 1 0*/
              return safeLog(Math.exp(bnLptA(kyz,pi,sigma,rho,d) + bnLptAp1(kxz,pi,sigma,rho,d)) + Math.exp(bnLptAp1(kxz,pi,sigma,rho,d) + bnLptA(kyz,pi,sigma,rho,d))+Math.exp(bnLptA(kyz,pi,sigma,rho,d) + bnLptA(kxz,pi,sigma,rho,d) + bnLptOneMinusSr(pi,sigma,rho,d))) + bnLptM(kxy,pi,sigma,rho,d) + bnLptOneMinusSr(pi,sigma,rho,d) - safeLog(3.0);
            }
          }else{
            if(zx>0){  /*1 1 1 0 0 1*/
              return bnLptM(kxy,pi,sigma,rho,d) + bnLptA(kyz,pi,sigma,rho,d) + safeLog(Math.exp(bnLptAp1(kxz,pi,sigma,rho,d)) + 2.0*Math.exp(bnLptA(kxz,pi,sigma,rho,d) + bnLptOneMinusSr(pi,sigma,rho,d))) - safeLog(3.0);
            }else{     /*1 1 1 0 0 0*/
              return bnLptM(kxy,pi,sigma,rho,d) + bnLptA(kyz,pi,sigma,rho,d) + safeLog(Math.exp(bnLptNp1(kxz,pi,sigma,rho,d))+2.0*Math.exp(bnLptN(kxz,pi,sigma,rho,d))) - safeLog(3.0);
            }
          }
        }
      }else{
        if(zy>0){
          if(xz>0){
            if(zx>0){  /*1 1 0 1 1 1*/
              return safeLog(Math.exp(bnLptM(kxz,pi,sigma,rho,d)) * (Math.exp(bnLptAp1(kyz,pi,sigma,rho,d) + bnLptM(kxy,pi,sigma,rho,d)) + Math.exp(bnLptA(kyz,pi,sigma,rho,d) + bnLptMp1(kxy,pi,sigma,rho,d) + bnLptOneMinusSr(pi,sigma,rho,d)) + Math.exp(bnLptA(kyz,pi,sigma,rho,d) + bnLptM(kxy,pi,sigma,rho,d) + bnLptOneMinusSr(pi,sigma,rho,d)))/3.0 + 2.0*Math.exp(bnLptA(kxy,pi,sigma,rho,d) + bnLptM(kxz,pi,sigma,rho,d) + bnLptA(kyz,pi,sigma,rho,d) + bnLptSr(pi,sigma,rho,d) + bnLptOneMinusSr(pi,sigma,rho,d))/3.0 + Math.exp(bnLptM(kxz,pi,sigma,rho,d) + bnLptA(kxy,pi,sigma,rho,d) + bnLptSr(pi,sigma,rho,d))*(Math.exp(bnLptAp1(kyz,pi,sigma,rho,d)) + Math.exp(bnLptA(kyz,pi,sigma,rho,d)+bnLptOneMinusSr(pi,sigma,rho,d)))/3.0);
            }else{     /*1 1 0 1 1 0*/
              return bnLptM(kxy,pi,sigma,rho,d) + safeLog(Math.exp(bnLptAp1(kyz,pi,sigma,rho,d)) + 2.0*Math.exp(bnLptA(kyz,pi,sigma,rho,d) + bnLptOneMinusSr(pi,sigma,rho,d))) + bnLptA(kxz,pi,sigma,rho,d) - safeLog(3.0);
            }
          }else{
            if(zx>0){  /*1 1 0 1 0 1*/
              return safeLog(Math.exp(bnLptMp1(kxy,pi,sigma,rho,d)) + 2.0*Math.exp(bnLptM(kxy,pi,sigma,rho,d)) + 4.0*Math.exp(bnLptA(kxy,pi,sigma,rho,d)+bnLptSr(pi,sigma,rho,d))) + bnLptA(kyz,pi,sigma,rho,d) + bnLptA(kxz,pi,sigma,rho,d) - safeLog(3.0);
            }else{     /*1 1 0 1 0 0*/
              return bnLptM(kxy,pi,sigma,rho,d)+bnLptA(kyz,pi,sigma,rho,d)+ bnLptN(kxz,pi,sigma,rho,d);
            }
          }
        }else{
          if(xz>0){
            if(zx>0){  /*1 1 0 0 1 1*/
              return bnLptM(kxy,pi,sigma,rho,d) + safeLog(Math.exp(bnLptNp1(kyz,pi,sigma,rho,d))+2.0*Math.exp(bnLptN(kyz,pi,sigma,rho,d))) + bnLptA(kxz,pi,sigma,rho,d) - safeLog(3.0);
            }else{     /*1 1 0 0 1 0*/
              return bnLptM(kxy,pi,sigma,rho,d) + safeLog(Math.exp(bnLptNp1(kyz,pi,sigma,rho,d))+2.0*Math.exp(bnLptN(kyz,pi,sigma,rho,d))) + bnLptA(kxz,pi,sigma,rho,d) - safeLog(3.0);
            }
          }else{
            if(zx>0){  /*1 1 0 0 0 1*/
              return bnLptM(kxy,pi,sigma,rho,d)+bnLptN(kyz,pi,sigma,rho,d)+ bnLptA(kxz,pi,sigma,rho,d);
            }else{     /*1 1 0 0 0 0*/
              return bnLptM(kxy,pi,sigma,rho,d)+bnLptN(kyz,pi,sigma,rho,d)+ bnLptN(kxz,pi,sigma,rho,d);
            }
          }
        }
      }
    }else{
      if(yz>0){
        if(zy>0){
          if(xz>0){
            if(zx>0){  /*1 0 1 1 1 1*/
              return safeLog(Math.exp(bnLptM(kyz,pi,sigma,rho,d)) * (Math.exp(bnLptAp1(kxy,pi,sigma,rho,d) + bnLptM(kxz,pi,sigma,rho,d)) + Math.exp(bnLptA(kxy,pi,sigma,rho,d) + bnLptMp1(kxz,pi,sigma,rho,d) + bnLptOneMinusSr(pi,sigma,rho,d)) + Math.exp(bnLptA(kxy,pi,sigma,rho,d) + bnLptM(kxz,pi,sigma,rho,d) + bnLptOneMinusSr(pi,sigma,rho,d)))/3.0 + 2.0*Math.exp(bnLptA(kxy,pi,sigma,rho,d) + bnLptM(kyz,pi,sigma,rho,d) + bnLptA(kxz,pi,sigma,rho,d) + bnLptSr(pi,sigma,rho,d) + bnLptOneMinusSr(pi,sigma,rho,d))/3.0 + Math.exp(bnLptM(kyz,pi,sigma,rho,d) + bnLptA(kxz,pi,sigma,rho,d) + bnLptSr(pi,sigma,rho,d))*(Math.exp(bnLptAp1(kxy,pi,sigma,rho,d)) + Math.exp(bnLptA(kxy,pi,sigma,rho,d)+bnLptOneMinusSr(pi,sigma,rho,d)))/3.0);
            }else{     /*1 0 1 1 1 0*/
              return bnLptA(kxy,pi,sigma,rho,d) + bnLptM(kyz,pi,sigma,rho,d) + safeLog(Math.exp(bnLptAp1(kxz,pi,sigma,rho,d)) + 2.0*Math.exp(bnLptA(kxz,pi,sigma,rho,d) + bnLptOneMinusSr(pi,sigma,rho,d))) - safeLog(3.0);
            }
          }else{
            if(zx>0){  /*1 0 1 1 0 1*/
              return safeLog(Math.exp(bnLptA(kxy,pi,sigma,rho,d) + bnLptAp1(kxz,pi,sigma,rho,d)) + Math.exp(bnLptAp1(kxy,pi,sigma,rho,d) + bnLptA(kxz,pi,sigma,rho,d))+Math.exp(bnLptA(kxy,pi,sigma,rho,d) + bnLptA(kxz,pi,sigma,rho,d) + bnLptOneMinusSr(pi,sigma,rho,d))) + bnLptM(kyz,pi,sigma,rho,d) + bnLptOneMinusSr(pi,sigma,rho,d) - safeLog(3.0);
            }else{     /*1 0 1 1 0 0*/
              return bnLptA(kxy,pi,sigma,rho,d) + bnLptM(kxy,pi,sigma,rho,d) + safeLog(Math.exp(bnLptNp1(kxz,pi,sigma,rho,d)) + 2.0*Math.exp(bnLptN(kxz,pi,sigma,rho,d))) - safeLog(3.0);
            }
          }
        }else{
          if(xz>0){
            if(zx>0){  /*1 0 1 0 1 1*/
              return bnLptA(kxy,pi,sigma,rho,d) + bnLptA(kxy,pi,sigma,rho,d) + safeLog(Math.exp(bnLptMp1(kxz,pi,sigma,rho,d)) + 2.0*Math.exp(bnLptM(kxz,pi,sigma,rho,d)) + 4.0*Math.exp(bnLptA(kxz,pi,sigma,rho,d)+bnLptSr(pi,sigma,rho,d))) - safeLog(3.0);
            }else{     /*1 0 1 0 1 0*/
              return bnLptA(kxy,pi,sigma,rho,d) + bnLptA(kyz,pi,sigma,rho,d) + safeLog(Math.exp(bnLptAp1(kxz,pi,sigma,rho,d)) + 2.0*Math.exp(bnLptA(kxz,pi,sigma,rho,d) + bnLptOneMinusSr(pi,sigma,rho,d))) - safeLog(3.0);
            }
          }else{
            if(zx>0){  /*1 0 1 0 0 1*/
              return bnLptA(kxy,pi,sigma,rho,d) + bnLptA(kyz,pi,sigma,rho,d) + safeLog(Math.exp(bnLptAp1(kxz,pi,sigma,rho,d)) + 2.0*Math.exp(bnLptA(kxz,pi,sigma,rho,d) + bnLptOneMinusSr(pi,sigma,rho,d))) - safeLog(3.0);
            }else{     /*1 0 1 0 0 0*/
              return bnLptA(kxy,pi,sigma,rho,d) + bnLptA(kyz,pi,sigma,rho,d) + safeLog(Math.exp(bnLptNp1(kxz,pi,sigma,rho,d)) + 2.0*Math.exp(bnLptN(kxz,pi,sigma,rho,d) + bnLptN1(pi,sigma,rho,d))) - safeLog(3.0);
            }
          }
        }
      }else{
        if(zy>0){
          if(xz>0){
            if(zx>0){  /*1 0 0 1 1 1*/
              return safeLog(Math.exp(bnLptAp1(kxy,pi,sigma,rho,d)) + 2.0*Math.exp(bnLptA(kxy,pi,sigma,rho,d) + bnLptOneMinusSr(pi,sigma,rho,d))) + bnLptA(kyz,pi,sigma,rho,d) + bnLptM(kxz,pi,sigma,rho,d) - safeLog(3.0);
            }else{     /*1 0 0 1 1 0*/
              return bnLptA(kxy,pi,sigma,rho,d)+bnLptA(kyz,pi,sigma,rho,d)+ bnLptA(kxz,pi,sigma,rho,d);
            }
          }else{
            if(zx>0){  /*1 0 0 1 0 1*/
              return safeLog(Math.exp(bnLptAp1(kxy,pi,sigma,rho,d)) + 2.0*Math.exp(bnLptA(kxy,pi,sigma,rho,d) + bnLptOneMinusSr(pi,sigma,rho,d))) + bnLptA(kyz,pi,sigma,rho,d) + bnLptA(kxz,pi,sigma,rho,d) - safeLog(3.0);
            }else{     /*1 0 0 1 0 0*/
              return bnLptA(kxy,pi,sigma,rho,d)+bnLptA(kyz,pi,sigma,rho,d)+ bnLptN(kxz,pi,sigma,rho,d);
            }
          }
        }else{
          if(xz>0){
            if(zx>0){  /*1 0 0 0 1 1*/
              return bnLptA(kxy,pi,sigma,rho,d)+bnLptN(kyz,pi,sigma,rho,d)+ bnLptM(kxz,pi,sigma,rho,d);
            }else{     /*1 0 0 0 1 0*/
               return bnLptA(kxy,pi,sigma,rho,d)+bnLptN(kyz,pi,sigma,rho,d)+ bnLptA(kxz,pi,sigma,rho,d);
           }
          }else{
            if(zx>0){  /*1 0 0 0 0 1*/
              return bnLptA(kxy,pi,sigma,rho,d)+bnLptN(kyz,pi,sigma,rho,d)+ bnLptA(kxz,pi,sigma,rho,d);
            }else{     /*1 0 0 0 0 0*/
              return bnLptA(kxy,pi,sigma,rho,d)+bnLptN(kyz,pi,sigma,rho,d)+ bnLptN(kxz,pi,sigma,rho,d);
            }
          }
        }
      }
    }
  }else{
    if(yx>0){
      if(yz>0){
        if(zy>0){
          if(xz>0){
            if(zx>0){  /*0 1 1 1 1 1*/
              return safeLog(Math.exp(bnLptM(kyz,pi,sigma,rho,d))*(Math.exp(bnLptAp1(kxy,pi,sigma,rho,d)+bnLptM(kxz,pi,sigma,rho,d))+Math.exp(bnLptA(kxy,pi,sigma,rho,d)+bnLptMp1(kxz,pi,sigma,rho,d)+bnLptOneMinusSr(pi,sigma,rho,d))+Math.exp(bnLptA(kxy,pi,sigma,rho,d)+bnLptM(kxz,pi,sigma,rho,d)+bnLptOneMinusSr(pi,sigma,rho,d)))/3.0+2.0*Math.exp(bnLptA(kxy,pi,sigma,rho,d)+bnLptM(kyz,pi,sigma,rho,d)+bnLptA(kxz,pi,sigma,rho,d)+bnLptSr(pi,sigma,rho,d)+bnLptOneMinusSr(pi,sigma,rho,d))/3.0+Math.exp(bnLptM(kyz,pi,sigma,rho,d)+bnLptA(kxz,pi,sigma,rho,d)+bnLptSr(pi,sigma,rho,d))*(Math.exp(bnLptA(kxy,pi,sigma,rho,d))+1.0+Math.exp(bnLptA(kxy,pi,sigma,rho,d)+bnLptOneMinusSr(pi,sigma,rho,d)))/3.0+2.0*Math.exp(bnLptN(kxy,pi,sigma,rho,d)+bnLptM(kyz,pi,sigma,rho,d)+bnLptM(kxz,pi,sigma,rho,d)+bnLptA1(pi,sigma,rho,d))/3.0+2.0*Math.exp(bnLptM(kyz,pi,sigma,rho,d))*(Math.exp(bnLptN(kxy,pi,sigma,rho,d)+bnLptA(kxz,pi,sigma,rho,d)+bnLptA1(pi,sigma,rho,d)+bnLptSr(pi,sigma,rho,d))+Math.exp(bnLptA(kxy,pi,sigma,rho,d)+bnLptN(kxz,pi,sigma,rho,d)+bnLptM1(pi,sigma,rho,d)+bnLptOneMinusSr(pi,sigma,rho,d)))/3.0);
            }else{     /*0 1 1 1 1 0*/
              return bnLptA(kxy,pi,sigma,rho,d) + safeLog(Math.exp(bnLptMp1(kyz,pi,sigma,rho,d)) + 2.0*Math.exp(bnLptM(kyz,pi,sigma,rho,d)) + 4.0*Math.exp(bnLptA(kyz,pi,sigma,rho,d)+bnLptSr(pi,sigma,rho,d))) + bnLptA(kxz,pi,sigma,rho,d) - safeLog(3.0);
            }
          }else{
            if(zx>0){  /*0 1 1 1 0 1*/
              return bnLptA(kxy,pi,sigma,rho,d) + bnLptM(kyz,pi,sigma,rho,d) + safeLog(Math.exp(bnLptAp1(kxz,pi,sigma,rho,d)) + 2.0*Math.exp(bnLptA(kxz,pi,sigma,rho,d) + bnLptOneMinusSr(pi,sigma,rho,d))) - safeLog(3.0);
            }else{     /*0 1 1 1 0 0*/
              return bnLptA(kxy,pi,sigma,rho,d)+bnLptM(kyz,pi,sigma,rho,d)+ bnLptN(kxz,pi,sigma,rho,d);
            }
          }
        }else{
          if(xz>0){  
            if(zx>0){  /*0 1 1 0 1 1*/
              return bnLptA(kxy,pi,sigma,rho,d) + safeLog(Math.exp(bnLptAp1(kyz,pi,sigma,rho,d)) + 2.0*Math.exp(bnLptA(kyz,pi,sigma,rho,d) + bnLptOneMinusSr(pi,sigma,rho,d))) + bnLptM(kxz,pi,sigma,rho,d) - safeLog(3.0);
            }else{     /*0 1 1 0 1 0*/
              return bnLptA(kxy,pi,sigma,rho,d) + safeLog(Math.exp(bnLptAp1(kyz,pi,sigma,rho,d)) + 2.0*Math.exp(bnLptA(kyz,pi,sigma,rho,d) + bnLptOneMinusSr(pi,sigma,rho,d))) + bnLptA(kxz,pi,sigma,rho,d) - safeLog(3.0);
            }
          }else{
            if(zx>0){  /*0 1 1 0 0 1*/
              return bnLptA(kxy,pi,sigma,rho,d)+bnLptA(kyz,pi,sigma,rho,d)+ bnLptA(kxz,pi,sigma,rho,d);
            }else{     /*0 1 1 0 0 0*/
              return bnLptA(kxy,pi,sigma,rho,d)+bnLptA(kyz,pi,sigma,rho,d)+ bnLptN(kxz,pi,sigma,rho,d);
            }
          }
        }
      }else{
        if(zy>0){
          if(xz>0){
            if(zx>0){  /*0 1 0 1 1 1*/
              return safeLog(Math.exp(bnLptA(kxy,pi,sigma,rho,d) + bnLptAp1(kyz,pi,sigma,rho,d)) + Math.exp(bnLptAp1(kxy,pi,sigma,rho,d) + bnLptA(kyz,pi,sigma,rho,d)) + Math.exp(bnLptA(kxy,pi,sigma,rho,d) + bnLptA(kyz,pi,sigma,rho,d)+bnLptOneMinusSr(pi,sigma,rho,d)) + 2.0*Math.exp(bnLptA(kxy,pi,sigma,rho,d)+bnLptN(kyz,pi,sigma,rho,d)+bnLptA1(pi,sigma,rho,d)) + 2.0*Math.exp(bnLptN(kxy,pi,sigma,rho,d)+bnLptA1(pi,sigma,rho,d)+bnLptA(kyz,pi,sigma,rho,d))) + bnLptM(kxz,pi,sigma,rho,d) + bnLptOneMinusSr(pi,sigma,rho,d) - safeLog(3.0);
            }else{     /*0 1 0 1 1 0*/
              return safeLog(Math.exp(bnLptAp1(kxy,pi,sigma,rho,d)) + 2.0*Math.exp(bnLptA(kxy,pi,sigma,rho,d) + bnLptOneMinusSr(pi,sigma,rho,d)) + 2.0*Math.exp(bnLptN(kxy,pi,sigma,rho,d) + bnLptA1(pi,sigma,rho,d))) + bnLptA(kyz,pi,sigma,rho,d) + bnLptA(kxz,pi,sigma,rho,d) - safeLog(3.0);
            }
          }else{
            if(zx>0){  /*0 1 0 1 0 1*/
              return safeLog(Math.exp(bnLptAp1(kxy,pi,sigma,rho,d))+2.0*Math.exp(bnLptA(kxy,pi,sigma,rho,d)+bnLptOneMinusSr(pi,sigma,rho,d))+2.0*Math.exp(bnLptN(kxy,pi,sigma,rho,d)+bnLptA1(pi,sigma,rho,d))) + bnLptA(kyz,pi,sigma,rho,d) + bnLptA(kxz,pi,sigma,rho,d) - safeLog(3.0);
            }else{     /*0 1 0 1 0 0*/
              return bnLptA(kxy,pi,sigma,rho,d)+bnLptA(kyz,pi,sigma,rho,d)+ bnLptN(kxz,pi,sigma,rho,d);
            }
          }
        }else{
          if(xz>0){
            if(zx>0){  /*0 1 0 0 1 1*/
              return bnLptA(kxy,pi,sigma,rho,d) + safeLog(Math.exp(bnLptNp1(kyz,pi,sigma,rho,d))+2.0*Math.exp(bnLptN(kyz,pi,sigma,rho,d)+bnLptN1(pi,sigma,rho,d))) + bnLptM(kxz,pi,sigma,rho,d) - safeLog(3.0);
            }else{     /*0 1 0 0 1 0*/
              return bnLptA(kxy,pi,sigma,rho,d) + safeLog(Math.exp(bnLptNp1(kyz,pi,sigma,rho,d))+2.0*Math.exp(bnLptN(kyz,pi,sigma,rho,d)+bnLptN1(pi,sigma,rho,d))) + bnLptA(kxz,pi,sigma,rho,d) - safeLog(3.0);
            }
          }else{
            if(zx>0){  /*0 1 0 0 0 1*/
              return bnLptA(kxy,pi,sigma,rho,d)+bnLptN(kyz,pi,sigma,rho,d)+ bnLptA(kxz,pi,sigma,rho,d);
            }else{     /*0 1 0 0 0 0*/
              return bnLptA(kxy,pi,sigma,rho,d)+bnLptN(kyz,pi,sigma,rho,d)+ bnLptN(kxz,pi,sigma,rho,d);
            }
          }
        }
      }
    }else{
      if(yz>0){
        if(zy>0){
          if(xz>0){
            if(zx>0){  /*0 0 1 1 1 1*/
              return safeLog(Math.exp(bnLptNp1(kxy,pi,sigma,rho,d)) + 2.0*Math.exp(bnLptN(kxy,pi,sigma,rho,d) + bnLptN1(pi,sigma,rho,d))) + bnLptM(kyz,pi,sigma,rho,d) + bnLptM(kxz,pi,sigma,rho,d) - safeLog(3.0);
            }else{     /*0 0 1 1 1 0*/
              return bnLptN(kxy,pi,sigma,rho,d)+bnLptM(kyz,pi,sigma,rho,d)+ bnLptA(kxz,pi,sigma,rho,d);
            }
          }else{
            if(zx>0){  /*0 0 1 1 0 1*/
              return safeLog(Math.exp(bnLptNp1(kxy,pi,sigma,rho,d)) + 2.0*Math.exp(bnLptN(kxy,pi,sigma,rho,d) + bnLptN1(pi,sigma,rho,d))) + bnLptM(kyz,pi,sigma,rho,d) + bnLptA(kxz,pi,sigma,rho,d) - safeLog(3.0);
            }else{     /*0 0 1 1 0 0*/
              return bnLptN(kxy,pi,sigma,rho,d)+bnLptM(kyz,pi,sigma,rho,d)+ bnLptN(kxz,pi,sigma,rho,d);
            }
          }
        }else{
          if(xz>0){
            if(zx>0){  /*0 0 1 0 1 1*/
              return bnLptN(kxy,pi,sigma,rho,d)+bnLptA(kyz,pi,sigma,rho,d)+ bnLptM(kxz,pi,sigma,rho,d);
            }else{     /*0 0 1 0 1 0*/
              return bnLptN(kxy,pi,sigma,rho,d)+bnLptA(kyz,pi,sigma,rho,d)+ bnLptA(kxz,pi,sigma,rho,d);
            }
          }else{
            if(zx>0){  /*0 0 1 0 0 1*/
              return bnLptN(kxy,pi,sigma,rho,d)+bnLptA(kyz,pi,sigma,rho,d)+ bnLptA(kxz,pi,sigma,rho,d);
            }else{     /*0 0 1 0 0 0*/
              return bnLptN(kxy,pi,sigma,rho,d)+bnLptA(kyz,pi,sigma,rho,d)+ bnLptN(kxz,pi,sigma,rho,d);
            }
          }
        }
      }else{
        if(zy>0){
          if(xz>0){
            if(zx>0){  /*0 0 0 1 1 1*/
              return safeLog(Math.exp(bnLptNp1(kxy,pi,sigma,rho,d)) + 2.0*Math.exp(bnLptN(kxy,pi,sigma,rho,d) + bnLptN1(pi,sigma,rho,d))) + bnLptA(kyz,pi,sigma,rho,d) + bnLptM(kxz,pi,sigma,rho,d) - safeLog(3.0);
            }else{     /*0 0 0 1 1 0*/
              return bnLptN(kxy,pi,sigma,rho,d)+bnLptA(kyz,pi,sigma,rho,d)+ bnLptA(kxz,pi,sigma,rho,d);
            }
          }else{
            if(zx>0){  /*0 0 0 1 0 1*/
              return safeLog(Math.exp(bnLptNp1(kxy,pi,sigma,rho,d)) + 2.0*Math.exp(bnLptN(kxy,pi,sigma,rho,d) + bnLptN1(pi,sigma,rho,d))) + bnLptA(kxz,pi,sigma,rho,d) + bnLptA(kyz,pi,sigma,rho,d) - safeLog(3.0);
            }else{     /*0 0 0 1 0 0*/
              return bnLptN(kxy,pi,sigma,rho,d)+bnLptA(kyz,pi,sigma,rho,d)+ bnLptN(kxz,pi,sigma,rho,d);
            }
          }
        }else{
          if(xz>0){
            if(zx>0){  /*0 0 0 0 1 1*/
              return bnLptN(kxy,pi,sigma,rho,d)+bnLptN(kyz,pi,sigma,rho,d)+ bnLptM(kxz,pi,sigma,rho,d);
            }else{     /*0 0 0 0 1 0*/
              return bnLptN(kxy,pi,sigma,rho,d)+bnLptN(kyz,pi,sigma,rho,d)+ bnLptA(kxz,pi,sigma,rho,d);
            }
          }else{
            if(zx>0){  /*0 0 0 0 0 1*/
              return bnLptN(kxy,pi,sigma,rho,d)+bnLptN(kyz,pi,sigma,rho,d)+ bnLptA(kxz,pi,sigma,rho,d);
            }else{     /*0 0 0 0 0 0*/
              return bnLptN(kxy,pi,sigma,rho,d)+bnLptN(kyz,pi,sigma,rho,d)+ bnLptN(kxz,pi,sigma,rho,d);
            }
          }
        }
      }
    }
  }
}
