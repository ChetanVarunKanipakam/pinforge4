/* Minimal STM32F103 register header for PinForge (CMSIS-style names). */
#ifndef STM32F1_H
#define STM32F1_H
#include <stdint.h>
typedef struct { volatile uint32_t CRL, CRH, IDR, ODR, BSRR, BRR, LCKR; } GPIO_TypeDef;
typedef struct { volatile uint32_t CR, CFGR, CIR, APB2RSTR, APB1RSTR, AHBENR, APB2ENR, APB1ENR, BDCR, CSR; } RCC_TypeDef;
typedef struct { volatile uint32_t SR, DR, BRR, CR1, CR2, CR3, GTPR; } USART_TypeDef;
typedef struct { volatile uint32_t SR, CR1, CR2, SMPR1, SMPR2, JOFR1, JOFR2, JOFR3, JOFR4, HTR, LTR, SQR1, SQR2, SQR3, JSQR, JDR1, JDR2, JDR3, JDR4, DR; } ADC_TypeDef;
typedef struct { volatile uint32_t CR1, CR2, SMCR, DIER, SR, EGR, CCMR1, CCMR2, CCER, CNT, PSC, ARR, RCR, CCR1, CCR2, CCR3, CCR4; } TIM_TypeDef;
typedef struct { volatile uint32_t IMR, EMR, RTSR, FTSR, SWIER, PR; } EXTI_TypeDef;
typedef struct { volatile uint32_t EVCR, MAPR, EXTICR[4]; } AFIO_TypeDef;
typedef struct { volatile uint32_t CTRL, LOAD, VAL, CALIB; } SysTick_TypeDef;

#define GPIOA ((GPIO_TypeDef *)0x40010800)
#define GPIOB ((GPIO_TypeDef *)0x40010C00)
#define GPIOC ((GPIO_TypeDef *)0x40011000)
#define RCC   ((RCC_TypeDef *)0x40021000)
#define AFIO  ((AFIO_TypeDef *)0x40010000)
#define EXTI  ((EXTI_TypeDef *)0x40010400)
#define ADC1  ((ADC_TypeDef *)0x40012400)
#define TIM2  ((TIM_TypeDef *)0x40000000)
#define TIM3  ((TIM_TypeDef *)0x40000400)
#define TIM4  ((TIM_TypeDef *)0x40000800)
#define USART1 ((USART_TypeDef *)0x40013800)
#define USART2 ((USART_TypeDef *)0x40004400)
#define USART3 ((USART_TypeDef *)0x40004800)
#define SysTick ((SysTick_TypeDef *)0xE000E010)
#define NVIC_ISER ((volatile uint32_t *)0xE000E100)

#define RCC_APB2ENR_AFIOEN (1u << 0)
#define RCC_APB2ENR_IOPAEN (1u << 2)
#define RCC_APB2ENR_IOPBEN (1u << 3)
#define RCC_APB2ENR_IOPCEN (1u << 4)
#define RCC_APB2ENR_ADC1EN (1u << 9)
#define RCC_APB2ENR_USART1EN (1u << 14)
#define RCC_APB1ENR_TIM2EN (1u << 0)
#define RCC_APB1ENR_TIM3EN (1u << 1)
#define RCC_APB1ENR_TIM4EN (1u << 2)

#define EXTI0_IRQn 6
#define EXTI1_IRQn 7
#define TIM2_IRQn 28
#define TIM3_IRQn 29
#define USART1_IRQn 37
static inline void NVIC_EnableIRQ(int n) { NVIC_ISER[n >> 5] = 1u << (n & 31); }

#define GPIO_IN_FLOATING 0x4u
#define GPIO_IN_PULL     0x8u
#define GPIO_OUT_PP_2MHZ 0x2u
#define GPIO_OUT_PP_10MHZ 0x1u
#define GPIO_OUT_PP_50MHZ 0x3u
#define GPIO_AF_PP_2MHZ  0xAu
#define GPIO_ANALOG      0x0u
static inline void gpio_cfg(GPIO_TypeDef *g, int pin, uint32_t nib) {
    volatile uint32_t *r = pin < 8 ? &g->CRL : &g->CRH; int s = (pin & 7) * 4;
    *r = (*r & ~(0xFu << s)) | (nib << s);
}

#define SCB_ICSR (*(volatile uint32_t *)0xE000ED04)
#define SCB_SHPR ((volatile uint8_t *)0xE000ED18)
#define ADC1_2_IRQn 18
#define EXTI2_IRQn 8
#define EXTI3_IRQn 9
#define EXTI4_IRQn 10
#define EXTI9_5_IRQn 23
#define TIM4_IRQn 30
#define USART2_IRQn 38
#define USART3_IRQn 39
#define EXTI15_10_IRQn 40
#define SVCall_IRQn (-5)
#define PendSV_IRQn (-2)
#define SysTick_IRQn (-1)
/* priority 0 = most urgent, 15 = least urgent (4 bits, like the real chip) */
static inline void NVIC_SetPriority(int n, uint8_t p) {
    if (n >= 0) ((volatile uint8_t *)0xE000E400)[n] = (uint8_t)(p << 4);
    else SCB_SHPR[16 + n - 4] = (uint8_t)(p << 4);
}
static inline void NVIC_SetPendingIRQ(int n) { ((volatile uint32_t *)0xE000E200)[n >> 5] = 1u << (n & 31); }
static inline void NVIC_ClearPendingIRQ(int n) { ((volatile uint32_t *)0xE000E280)[n >> 5] = 1u << (n & 31); }
static inline void NVIC_DisableIRQ(int n) { ((volatile uint32_t *)0xE000E180)[n >> 5] = 1u << (n & 31); }
static inline void __disable_irq(void) { __asm volatile ("cpsid i" ::: "memory"); }
static inline void __enable_irq(void) { __asm volatile ("cpsie i" ::: "memory"); }
static inline void __WFI(void) { __asm volatile ("wfi"); }
static inline void __SVC0(void) { __asm volatile ("svc 0"); }
#endif
