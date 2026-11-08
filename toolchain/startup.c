extern unsigned _etext, _sdata, _edata, _sbss, _ebss, _estack;
int main(void);
void Default_Handler(void) { for (;;); }
void Reset_Handler(void) {
    unsigned *s = &_etext, *d = &_sdata;
    while (d < &_edata) *d++ = *s++;
    for (d = &_sbss; d < &_ebss;) *d++ = 0;
    main();
    for (;;);
}
#define W(n) void n(void) __attribute__((weak, alias("Default_Handler")))
W(NMI_Handler); W(HardFault_Handler); W(SVC_Handler); W(PendSV_Handler); W(SysTick_Handler);
W(EXTI0_IRQHandler); W(EXTI1_IRQHandler); W(EXTI2_IRQHandler); W(EXTI3_IRQHandler); W(EXTI4_IRQHandler);
W(ADC1_2_IRQHandler); W(EXTI9_5_IRQHandler); W(TIM2_IRQHandler); W(TIM3_IRQHandler); W(TIM4_IRQHandler);
W(USART1_IRQHandler); W(USART2_IRQHandler); W(USART3_IRQHandler); W(EXTI15_10_IRQHandler);
__attribute__((section(".isr_vector"), used)) void (*const vectors[76])(void) = {
    [0] = (void (*)(void))&_estack, [1] = Reset_Handler, [2] = NMI_Handler, [3] = HardFault_Handler,
    [11] = SVC_Handler, [14] = PendSV_Handler, [15] = SysTick_Handler,
    [22] = EXTI0_IRQHandler, [23] = EXTI1_IRQHandler, [24] = EXTI2_IRQHandler, [25] = EXTI3_IRQHandler, [26] = EXTI4_IRQHandler,
    [34] = ADC1_2_IRQHandler, [39] = EXTI9_5_IRQHandler, [44] = TIM2_IRQHandler, [45] = TIM3_IRQHandler, [46] = TIM4_IRQHandler,
    [53] = USART1_IRQHandler, [54] = USART2_IRQHandler, [55] = USART3_IRQHandler, [56] = EXTI15_10_IRQHandler };
void *memcpy(void *d, const void *s, unsigned n) { char *a = d; const char *b = s; while (n--) *a++ = *b++; return d; }
void *memset(void *d, int c, unsigned n) { char *a = d; while (n--) *a++ = (char)c; return d; }
