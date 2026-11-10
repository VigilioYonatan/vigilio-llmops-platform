Feature: Facebook Data Deletion Callback

  Scenario: Unsigned or invalid signed_request is rejected
    When Meta sends deletion request with invalid signature
    Then the API status should be 403

  Scenario: Valid signed_request generates confirmation code and returns status URL
    When Meta sends valid signed deletion request for user "fb-user-123"
    Then the API status should be 200
    And the response contains a tracking url and confirmation code

  Scenario: Anonymous user can query deletion status by code
    When I request GET "/api/v1/privacy/deletion-status/del-req-confirmation-code-12345" without credentials
    Then the API status should be 200
