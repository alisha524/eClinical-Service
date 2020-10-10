<%-- 
    Document   : symptomSelector
    Created on : 5 Oct, 2020, 7:09:01 PM
    Author     : Alisha
--%>
<%@ taglib uri="http://java.sun.com/jsp/jstl/core" prefix="c" %>
<%@page import="java.lang.*"%>
<%@page contentType="text/html" pageEncoding="UTF-8"%>
<%@ page import="java.util.List" %>
<%@ page import="java.util.Date" %>


<!DOCTYPE html>

    <head>
        <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
        <title>Result</title>
    </head>
    
       
        <h1>Result</h1>
        <%
            List<String> symptoms  = (List<String>)request.getAttribute("symptoms");
            
            %>
            <h4> Since you are facing the following symptoms:  </h4> <br>
            <%for(String e :  symptoms){ %> 
            <br>
            
            <%= e %>
            <br>
            <% } %>
            <br>
            <p> We suggest you take proper precautions and avoid going out for some time. </P>
            <hr>
            
            

</html>