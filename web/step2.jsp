<%-- 
    Document   : step2
    Created on : 5 Oct, 2020, 6:50:03 PM
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
        <h4>Step 2: Select the symptoms you are facing </h4>
        <form action="symptomController" method="post">
         <input type="checkbox" name="symptoms" id ="high" value="Breath"/>Breath <br>
         <input type="checkbox" name="symptoms" id ="high"value="Fever"/>Fever <br>
         <input type="checkbox" name="symptoms" id ="high"value="Shivering"/>Shivering <br>
         <input type="checkbox" name="symptoms" id ="high"value="Headache "/>Headache <br>
         <input type="checkbox" name="symptoms" id ="high"value="Dry Cough"/>Dry Cough <br>
         <input type="checkbox" name="symptoms" id ="high"value="Discoloration of fingers"/>Discoloration of fingers <br>
         <input type="checkbox" name="symptoms" id ="high"value="Tiredness"/>Tiredness <br>
         <input type="checkbox" name="symptoms" id ="high"value="Chest pain"/>Chest pain  <br>
         <input type="hidden" name="hidval" id="hiddenvalues"/>
           <br>
         <input type="submit" value="Submit"/> 
      </form>
       
        
    </body>
</html>
