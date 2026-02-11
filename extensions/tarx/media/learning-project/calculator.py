# TARX Learning Project - Python Patterns
# Demonstrates enums, type safety, and pattern matching

from enum import Enum
from typing import Optional
from dataclasses import dataclass


class Operation(Enum):
    """Supported calculator operations.

    TARX TIP: Enums provide type-safe choices.
    Try: "Add a POWER operation to this enum"
    """
    ADD = "+"
    SUBTRACT = "-"
    MULTIPLY = "*"
    DIVIDE = "/"


@dataclass
class CalculationResult:
    """Result of a calculation with metadata.

    TARX TIP: Dataclasses reduce boilerplate.
    """
    value: float
    operation: Operation
    operands: tuple[float, float]
    success: bool = True
    error: Optional[str] = None


def safe_divide(a: float, b: float) -> Optional[float]:
    """Divide safely, returning None on division by zero.

    TARX will notice this handles the edge case.
    Try: "What other edge cases should I handle?"
    """
    if b == 0:
        return None
    return a / b


def calculate(a: float, b: float, op: Operation) -> CalculationResult:
    """Perform a calculation.

    Try asking TARX: "Refactor this to use a dict dispatch"
    """
    result: Optional[float] = None
    error: Optional[str] = None

    if op == Operation.ADD:
        result = a + b
    elif op == Operation.SUBTRACT:
        result = a - b
    elif op == Operation.MULTIPLY:
        result = a * b
    elif op == Operation.DIVIDE:
        result = safe_divide(a, b)
        if result is None:
            error = "Division by zero"

    return CalculationResult(
        value=result if result is not None else 0.0,
        operation=op,
        operands=(a, b),
        success=error is None,
        error=error
    )


class AdvancedCalculator:
    """Calculator with history tracking.

    TARX TIP: Stateful classes benefit from clear state management.
    Try: "Add a method to export history as JSON"
    """

    def __init__(self):
        self.history: list[CalculationResult] = []
        self.result: float = 0.0

    def execute(self, a: float, b: float, op: Operation) -> CalculationResult:
        """Execute a calculation and store in history."""
        calc_result = calculate(a, b, op)
        self.history.append(calc_result)
        if calc_result.success:
            self.result = calc_result.value
        return calc_result

    def clear_history(self) -> None:
        """Clear calculation history."""
        self.history.clear()
        self.result = 0.0

    def get_history_summary(self) -> str:
        """Get a summary of all calculations."""
        if not self.history:
            return "No calculations performed"

        lines = []
        for i, calc in enumerate(self.history, 1):
            a, b = calc.operands
            lines.append(f"{i}. {a} {calc.operation.value} {b} = {calc.value}")

        return "\n".join(lines)


def main():
    """Demonstrate the calculator."""
    calc = AdvancedCalculator()

    # Perform some calculations
    calc.execute(10, 5, Operation.ADD)
    calc.execute(15, 3, Operation.MULTIPLY)
    calc.execute(45, 5, Operation.DIVIDE)
    calc.execute(9, 0, Operation.DIVIDE)  # This will fail safely

    print("=== Calculation History ===")
    print(calc.get_history_summary())
    print(f"\nFinal result: {calc.result}")


if __name__ == "__main__":
    main()
