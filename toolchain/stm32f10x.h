/* Compatibility header: code written for ST's "stm32f10x.h" builds unchanged (same register names). */
#ifndef STM32F10X_H
#define STM32F10X_H
#include "stm32f1.h"
static inline void SystemInit(void) {}
#endif
