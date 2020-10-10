<%-- 
    Document   : index
    Created on : 5 Oct, 2020, 6:46:34 PM
    Author     : Alisha
--%>

<%@page contentType="text/html" pageEncoding="UTF-8"%>
<!DOCTYPE html>
<html>
    <head>
        <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
        <title>Symptom Checker</title>
    </head>
    <body>
        <h4>Enter the following details</h4>
         <form action="errorfile.java" method="post">
    
  <p>Please select your gender:</p>
  <p style="color: red;">* required field</p> 
  <input type="radio" id="male" name="gender" value="male">
  <label for="male">Male</label><br>
  <input type="radio" id="female" name="gender" value="female">
  <label for="female">Female</label><br>
  <input type="radio" id="other" name="gender" value="other">
  <label for="other">Other</label>
  <span name="errorName">${errors.gender}</span>
  <br>  <br>
  <p>Please select your age:</p>
  <p style="color: red;">* required field</p> 
  <input type="radio" id="age1" name="age" value="30">
  <label for="age1">0 - 30</label><br>
  <input type="radio" id="age2" name="age" value="60">
  <label for="age2">31 - 60</label><br>  
  <input type="radio" id="age3" name="age" value="100">
  <label for="age3">61 - 100</label><br><br>
   <span name="errorGender">${errors.age}</span>
  <input type="submit" value="Submit">
</form>
  
    </body>
</html>
