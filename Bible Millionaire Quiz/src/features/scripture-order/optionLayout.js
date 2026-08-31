function optionKey(option) {
    return option?.key || option?.token;
}

function inferredSlotCount(previousSlots = [], nextOptions = [], explicitCount) {
    const highestSlot = [...previousSlots, ...nextOptions].reduce((highest, option) => (
        Number.isInteger(option?.slot) ? Math.max(highest, option.slot + 1) : highest
    ), 0);
    return Math.max(4, Number(explicitCount) || 0, highestSlot);
}

function stableSlots(previousSlots = [], nextOptions = [], slotCount) {
    const count = inferredSlotCount(previousSlots, nextOptions, slotCount);
    const slots = Array.from({ length: count }, () => null);
    const unplaced = [];
    nextOptions.forEach(option => {
        if (Number.isInteger(option.slot) && option.slot >= 0 && option.slot < count && !slots[option.slot]) {
            slots[option.slot] = option;
        } else {
            unplaced.push(option);
        }
    });
    slots.forEach((slot, index) => {
        if (!slot && unplaced.length > 0) slots[index] = unplaced.shift();
    });
    return slots;
}

export function planOptionRefill(previousSlots = [], nextOptions = [], slotCount) {
    const previousKeys = new Set(previousSlots.map(optionKey).filter(Boolean));
    const finalSlots = stableSlots(previousSlots, nextOptions, slotCount);
    const shuffled = finalSlots.map(option => (
        option && previousKeys.has(optionKey(option)) ? option : null
    ));
    return {
        shuffledSlots: shuffled,
        finalSlots,
        incomingKeys: finalSlots.filter(option => (
            option && !previousKeys.has(optionKey(option))
        )).map(optionKey)
    };
}

export function arrangeOptionSlots({
    previousSlots = [],
    nextOptions = [],
    transition = 'initial',
    slotCount,
} = {}) {
    if (transition === 'correct') return planOptionRefill(previousSlots, nextOptions, slotCount).finalSlots;
    return stableSlots(previousSlots, nextOptions, slotCount);
}

export default arrangeOptionSlots;
