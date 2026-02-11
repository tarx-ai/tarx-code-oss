# TARX Learning Project - Python Basics
# Try selecting this code and asking TARX to explain it

def greet(name: str) -> str:
    """Return a greeting message.

    TARX TIP: Type hints help TARX understand your code better.
    """
    return f"Hello, {name}!"


def calculate_average(numbers: list[float]) -> float:
    """Calculate the average of a list of numbers.

    Try asking TARX: "What happens if I pass an empty list?"
    """
    if not numbers:
        return 0.0  # Edge case: empty list
    return sum(numbers) / len(numbers)


class Calculator:
    """A simple calculator with memory.

    TARX TIP: TARX understands classes and can suggest improvements.
    Try: "How would you make this thread-safe?"
    """

    def __init__(self, value: float = 0):
        self.value = value
        self.history: list[float] = []

    def add(self, amount: float) -> float:
        """Add to the current value."""
        self.history.append(self.value)
        self.value += amount
        return self.value

    def subtract(self, amount: float) -> float:
        """Subtract from the current value."""
        self.history.append(self.value)
        self.value -= amount
        return self.value

    def undo(self) -> float:
        """Restore the previous value."""
        if self.history:
            self.value = self.history.pop()
        return self.value


def main():
    """Entry point - demonstrates TARX features."""
    # Greeting example
    name = "Developer"
    greeting = greet(name)
    print(greeting)

    # Average calculation
    numbers = [1, 2, 3, 4, 5]
    avg = calculate_average(numbers)
    print(f"Average: {avg}")

    # Calculator example
    calc = Calculator(10)
    calc.add(5)
    calc.subtract(3)
    print(f"Calculator result: {calc.value}")


if __name__ == "__main__":
    main()
