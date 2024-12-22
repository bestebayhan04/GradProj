import unittest
import requests
from query_data import query_rag
from langchain_community.llms.ollama import Ollama
from langchain_ollama import OllamaLLM


EVAL_PROMPT = """
Expected Response: {expected_response}
Actual Response: {actual_response}
---
(Answer with 'true' or 'false') Does the actual response match the expected response? 
"""

class TestGameRules(unittest.TestCase):
    
    def test_monopoly_rules(self):
        """Test how much total money a player starts with in Monopoly."""
        result = query_and_validate(
            question="How much total money does a player start with in Monopoly? (Answer with the number only)",
            expected_response="$1500",
        )
        self.assertTrue(result, "The response for Monopoly rules did not match the expected output.")

    def test_ticket_to_ride_rules(self):
        """Test how many points the longest continuous train gets in Ticket to Ride."""
        result = query_and_validate(
            question="How many points does the longest continuous train get in Ticket to Ride? (Answer with the number only)",
            expected_response="10 points",
        )
        self.assertTrue(result, "The response for Ticket to Ride rules did not match the expected output.")

def query_and_validate(question: str, expected_response: str):
    response_text = query_rag(question)
    prompt = EVAL_PROMPT.format(
        expected_response=expected_response, actual_response=response_text
    )

    with OllamaLLM(model="mistral") as model:
        evaluation_results_str = model.invoke(prompt)
        evaluation_results_str_cleaned = evaluation_results_str.strip().lower()

    print(prompt)  # This print could be useful for debugging but consider removing in production.

    if "true" in evaluation_results_str_cleaned:
        print("\033[92m" + f"Response: {evaluation_results_str_cleaned}" + "\033[0m")  # Prints in Green if correct.
        return True
    elif "false" in evaluation_results_str_cleaned:
        print("\033[91m" + f"Response: {evaluation_results_str_cleaned}" + "\033[0m")  # Prints in Red if incorrect.
        return False
    else:
        raise ValueError("Invalid evaluation result. Cannot determine if 'true' or 'false'.")

if __name__ == "__main__":
    unittest.main()
